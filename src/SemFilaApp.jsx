import React, { useEffect, useMemo, useState } from "react";
import "./SemFilaApp.css";
import {
  Bell,
  LayoutDashboard,
  PlusCircle,
  Ticket,
  Phone,
  Lock,
  LogOut,
} from "lucide-react";

const STORAGE_KEY = "semfila_queue_v2";
const LAST_TICKET_KEY = "semfila_last_ticket_v2";
const AVG_SERVICE_MINUTES = 10;
const ADMIN_PASSWORD = "1234";

const DEFAULT_SERVICES = [
  "Atendimento Geral",
  "Cadastro",
  "Retirada de Documento",
  "Financeiro",
  "Suporte",
];

const SERVICES_KEY = "semfila_services_v1";

function formatCpf(value) {
  const numbers = value.replace(/\D/g, "").slice(0, 11);

  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function formatPhone(phone) {
  const numbers = normalizePhone(phone).slice(0, 11);

  if (numbers.length <= 10) {
    return numbers
      .replace(/^(\d{0,2})/, "($1")
      .replace(/^\((\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .replace(/(-\d{4})\d+?$/, "$1");
  }

  return numbers
    .replace(/^(\d{0,2})/, "($1")
    .replace(/^\((\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{4})\d+?$/, "$1");
}

function buildWhatsAppLink(phone, message) {
  const cleanPhone = normalizePhone(phone);
  const phoneWithCountry = cleanPhone.startsWith("55")
    ? cleanPhone
    : `55${cleanPhone}`;

  return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
}

function formatDateTime(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHour(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estimateMinutes(position) {
  if (position <= 0) return 0;
  return position * AVG_SERVICE_MINUTES;
}

function getStatusLabel(status) {
  switch (status) {
    case "aguardando":
      return "Aguardando";
    case "em_atendimento":
      return "Em atendimento";
    case "finalizado":
      return "Finalizado";
    default:
      return status;
  }
}

function reindexQueue(queue) {
  const waiting = queue
    .filter((item) => item.status === "aguardando")
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    .map((item, index) => ({
      ...item,
      position: index + 1,
      estimatedMinutes: estimateMinutes(index),
    }));

  const current = queue
    .filter((item) => item.status === "em_atendimento")
    .map((item) => ({
      ...item,
      position: 0,
      estimatedMinutes: 0,
    }));

  const finished = queue
    .filter((item) => item.status === "finalizado")
    .map((item) => ({
      ...item,
      position: null,
      estimatedMinutes: 0,
    }));

  return [...current, ...waiting, ...finished];
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function saveLastTicket(ticket) {
  localStorage.setItem(LAST_TICKET_KEY, JSON.stringify(ticket));
}

function getWaitingQueue(queue) {
  return queue
    .filter((item) => item.status === "aguardando")
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
}

function getCurrentItem(queue) {
  return queue.find((item) => item.status === "em_atendimento") || null;
}

function buildNotificationMessage(ticket, peopleAhead) {
  const estimatedMinutes = Math.max(
    peopleAhead * AVG_SERVICE_MINUTES,
    AVG_SERVICE_MINUTES
  );

  return `*Olá*, ${ticket.name} 
Sua senha no Sem Fila é *${ticket.number}*.
Você é o próximo a ser atendido.
Tempo estimado: *${estimatedMinutes}* minuto(s).
Tipo do Serviço: *${ticket.service}*.
*Dirija-se ao atendimento em breve.*`;
}

function sendWhatsAppNotification(ticket, peopleAhead) {
  if (!ticket?.notifyWhatsApp || !ticket?.phone) return;

  const message = buildNotificationMessage(ticket, peopleAhead);
  const link = buildWhatsAppLink(ticket.phone, message);

  window.open(link, "_blank");
}

function applyNotifications(queue) {
  const waiting = getWaitingQueue(queue);

  if (!waiting.length) return queue;

  const nextToNotify = waiting[0];

  return queue.map((item) => {
    if (item.id !== nextToNotify.id) return item;
    if (!item.notifyWhatsApp || !item.phone) return item;

    const alreadySent = item.notified || false;

    if (!alreadySent) {
      sendWhatsAppNotification(item, 0);

      return {
        ...item,
        notified: true,
        notificationSteps: [0],
      };
    }

    return item;
  });
}

function TicketCard({ ticket }) {
  if (!ticket) {
    return (
      <div className="empty-box">
        Nenhuma senha gerada ainda neste navegador.
      </div>
    );
  }

  return (
    <div className="ticket-card">
      <div className="ticket-main">
        <div>
          <span className="ticket-label">Senha</span>
          <strong className="ticket-number">{ticket.number}</strong>
        </div>

        <div>
          <span className="ticket-label">Status</span>
          <strong>{getStatusLabel(ticket.status)}</strong>
        </div>

        <div>
          <span className="ticket-label">Posição</span>
          <strong>
            {ticket.status === "em_atendimento"
              ? "Sendo atendido"
              : ticket.status === "finalizado"
              ? "-"
              : `${ticket.position ?? "-"}º`}
          </strong>
        </div>

        <div>
          <span className="ticket-label">Previsão</span>
          <strong>
            {ticket.status === "aguardando"
              ? `${ticket.estimatedMinutes ?? 0} min`
              : "Agora"}
          </strong>
        </div>
      </div>

      <div className="ticket-extra">
        <p>
          <strong>Nome:</strong> {ticket.name}
        </p>
        <p>
          <strong>CPF:</strong> {ticket.cpf || "-"}
        </p>
        <p>
          <strong>Serviço:</strong> {ticket.service}
        </p>
        <p>
          <strong>Entrada:</strong> {formatDateTime(ticket.joinedAt)}
        </p>
        {ticket.phone ? (
          <p>
            <strong>Telefone:</strong> {formatPhone(ticket.phone)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function QueueTable({ title, items, emptyText, actions }) {
  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>{title}</h3>
        <span>{items.length} item(ns)</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-box">{emptyText}</div>
      ) : (
        <div className="table-wrapper">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Senha</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Serviço</th>
                <th>Status</th>
                <th>Posição</th>
                <th>Previsão</th>
                <th>Telefone</th>
                <th>Entrada</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.number}</td>
                  <td>{item.name}</td>
                  <td>{item.cpf || "-"}</td>
                  <td>{item.service}</td>
                  <td>{getStatusLabel(item.status)}</td>
                  <td>
                    {item.status === "em_atendimento"
                      ? "Agora"
                      : item.position ?? "-"}
                  </td>
                  <td>
                    {item.status === "aguardando"
                      ? `${item.estimatedMinutes ?? 0} min`
                      : "-"}
                  </td>
                  <td>{item.phone ? formatPhone(item.phone) : "-"}</td>
                  <td>{formatHour(item.joinedAt)}</td>
                  <td>
                    <div className="table-actions">
                      {actions?.map((action) => (
                        <button
                          key={action.label}
                          className={`mini-btn ${action.variant || ""}`}
                          onClick={() => action.onClick(item)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientPage({
  queue,
  lastTicket,
  name,
  setName,
  cpf,
  setCpf,
  services,
  service,
  setService,
  phone,
  setPhone,
  notifyWhatsApp,
  setNotifyWhatsApp,
  onAddToQueue,
}) {
  const current = getCurrentItem(queue);
  const waiting = getWaitingQueue(queue);

  return (
    <div className="page-grid">
      <section className="card form-card">
        <div className="section-title">
          <div className="section-icon blue">
            <PlusCircle size={18} />
          </div>
          <div>
            <h2>Entrar na fila</h2>
            <p>Preencha os dados para gerar sua senha.</p>
          </div>
        </div>

        <form onSubmit={onAddToQueue} className="form-grid">
          <div className="form-group">
            <label>Nome Completo:</label>
            <input
              type="text"
              placeholder="Digite seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

                
                <div className="form-row two-columns">
        <div className="form-group">
          <label>CPF:</label>
          <input
            type="text"
            placeholder="Digite seu CPF"
            value={cpf}
            placeholder="999.999.999-99"
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            maxLength={14}
            required
          />
        </div>

        <div className="form-group">
          <label>Telefone:</label>
          <div className="input-with-icon">
            <Phone size={16} />
            <input
              type="tel"
              placeholder="(15) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </div>
        </div>
      </div>



          <div className="form-group">
            <label>Tipo de Atendimento:</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={notifyWhatsApp}
                onChange={(e) => setNotifyWhatsApp(e.target.checked)}
              />
              Receber aviso no WhatsApp quando minha vez estiver próxima
            </label>
          </div>

          <button className="primary-btn" type="submit">
            Gerar senha e entrar na fila
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">
          <div className="section-icon green">
            <Ticket size={18} />
          </div>
          <div>
            <h2>Acompanhamento</h2>
            <p>Consulte a última senha gerada neste navegador.</p>
          </div>
        </div>

        <TicketCard ticket={lastTicket} />
      </section>

      <section className="card info-card">
        <div className="section-title">
          <div className="section-icon yellow">
            <Bell size={18} />
          </div>
          <div>
            <h2>Painel rápido</h2>
            <p>Resumo da fila em tempo real.</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-box">
            <span>Total aguardando</span>
            <strong>{waiting.length}</strong>
          </div>
          <div className="stat-box">
            <span>Em atendimento</span>
            <strong>{current ? 1 : 0}</strong>
          </div>
          <div className="stat-box">
            <span>Próxima senha</span>
            <strong>{waiting[0]?.number ?? "-"}</strong>
          </div>
          <div className="stat-box">
            <span>Tempo médio</span>
            <strong>{AVG_SERVICE_MINUTES} min</strong>
          </div>
        </div>
      </section>

      <section className="card notes-card">
        <h3>Projeto Sem Fila Versão 3</h3>
      </section>
    </div>
  );
}

function AdminLogin({ passwordInput, setPasswordInput, onLogin, loginError }) {
  return (
    <div className="page-grid">
      <section className="card admin-login-card">
        <div className="section-title">
          <div className="section-icon dark">
            <Lock size={18} />
          </div>
          <div>
            <h2>Acesso ao Painel de Atendimento</h2>
            <p>Digite a senha administrativa para continuar.</p>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Senha administrativa</label>
            <input
              type="password"
              placeholder="Digite a senha"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLogin();
              }}
            />
          </div>

          {loginError ? <div className="error-text">{loginError}</div> : null}

          <button className="primary-btn" type="button" onClick={onLogin}>
            Entrar no painel
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminPage({
  queue,
  onCallNext,
  onFinishCurrent,
  onRemove,
  onReset,
  onLogout,
  onOpenServices,
}) {
  const waiting = getWaitingQueue(queue);
  const current = queue.filter((item) => item.status === "em_atendimento");
  const finished = queue
    .filter((item) => item.status === "finalizado")
    .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));

  const averageWait = waiting.length
    ? Math.round(
        waiting.reduce((acc, item) => acc + (item.estimatedMinutes ?? 0), 0) /
          waiting.length
      )
    : 0;

  return (
    <div className="page-grid">
      <section className="card admin-actions-card">
        <div className="admin-topbar">
          <div className="admin-title-block">
            <div className="section-icon dark">
              <LayoutDashboard size={18} />
            </div>

            <div>
              <h2 className="admin-title">Painel de atendimento</h2>
              <p className="admin-subtitle">
                Gerencie a fila, chame clientes e finalize atendimentos.
              </p>
            </div>
          </div>

          <button
            className="secondary-btn admin-exit-btn"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-box">
            <span>Aguardando</span>
            <strong>{waiting.length}</strong>
          </div>
          <div className="stat-box">
            <span>Em atendimento</span>
            <strong>{current.length}</strong>
          </div>
          <div className="stat-box">
            <span>Finalizados</span>
            <strong>{finished.length}</strong>
          </div>
          <div className="stat-box">
            <span>Espera média</span>
            <strong>{averageWait} min</strong>
          </div>
        </div>

        <div className="admin-buttons">
          <button className="primary-btn" type="button" onClick={onCallNext}>
            Chamar próxima senha
          </button>

          <button className="primary-btn" type="button" onClick={onFinishCurrent}>
            Finalizar atendimento atual
          </button>

          <button className="primary-btn" type="button" onClick={onOpenServices}>
            Cadastrar Novo Serviço
          </button>

          <button className="danger-btn" type="button" onClick={onReset}>
            Limpar fila
          </button>
        </div>
      </section>

      <QueueTable
        title="Em atendimento"
        items={current}
        emptyText="Nenhum atendimento em andamento."
        actions={[
          {
            label: "Finalizar",
            variant: "success",
            onClick: onFinishCurrent,
          },
        ]}
      />

      <QueueTable
        title="Aguardando"
        items={waiting}
        emptyText="Nenhuma pessoa aguardando na fila."
        actions={[
          {
            label: "Remover",
            variant: "danger",
            onClick: onRemove,
          },
        ]}
      />

      <QueueTable
        title="Finalizados"
        items={finished}
        emptyText="Nenhum atendimento finalizado."
        actions={[
          {
            label: "Remover",
            variant: "danger",
            onClick: onRemove,
          },
        ]}
      />
    </div>
  );
}

function AdminServicesPage({
  services,
  newService,
  setNewService,
  onAddService,
  onRemoveService,
  onBack,
  onLogout,
}) {
  return (
    <div className="page-grid">
      <section className="card admin-actions-card">
        <div className="admin-topbar">
          <div className="admin-title-block">
            <div className="section-icon blue">
              <PlusCircle size={18} />
            </div>

            <div>
              <h2 className="admin-title">Cadastrar Serviços</h2>
              <p className="admin-subtitle">
                Adicione ou remova os serviços disponíveis no atendimento.
              </p>
            </div>
          </div>

          <button
            className="primary-btn admin-exit-btn"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={16} />
            Área do Cliente
          </button>
        </div>

        <div className="service-back-row">
          <button type="button" className="primary-btn" onClick={onBack}>
            Painel de Atendimento
          </button>
        </div>

        <div className="service-manager">
          <div className="service-input-row">
            <input
              type="text"
              placeholder="Digite o nome do serviço"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
            />

            <button
              type="button"
              className="primary-btn services-side-btn"
              onClick={onAddService}
            >
              Adicionar Serviço
            </button>
          </div>

          <div className="service-list">
            {services.map((item) => (
              <div key={item} className="service-item">
                <span>{item}</span>

                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={() => onRemoveService(item)}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SemFilaApp() {
  const [activeTab, setActiveTab] = useState("cliente");
  const [adminView, setAdminView] = useState("painel");
  const [queue, setQueue] = useState([]);
  const [lastTicket, setLastTicket] = useState(null);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [service, setService] = useState(DEFAULT_SERVICES[0]);
  const [newService, setNewService] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const storedQueue = localStorage.getItem(STORAGE_KEY);
    const storedLastTicket = localStorage.getItem(LAST_TICKET_KEY);
    const storedServices = localStorage.getItem(SERVICES_KEY);

    if (storedServices) {
      const parsedServices = JSON.parse(storedServices);

      if (Array.isArray(parsedServices) && parsedServices.length > 0) {
        setServices(parsedServices);
        setService(parsedServices[0]);
      }
    }

    if (storedQueue) {
      const parsedQueue = JSON.parse(storedQueue);
      const reindexed = reindexQueue(parsedQueue);
      setQueue(reindexed);
      saveQueue(reindexed);
    }

    if (storedLastTicket) {
      setLastTicket(JSON.parse(storedLastTicket));
    }
  }, []);

  const syncedLastTicket = useMemo(() => {
    if (!lastTicket) return null;
    return queue.find((item) => item.id === lastTicket.id) || lastTicket;
  }, [queue, lastTicket]);

  function updateQueue(newQueue) {
    const reindexed = reindexQueue(newQueue);
    setQueue(reindexed);
    saveQueue(reindexed);

    if (lastTicket) {
      const updatedLast = reindexed.find((item) => item.id === lastTicket.id);
      if (updatedLast) {
        setLastTicket(updatedLast);
        saveLastTicket(updatedLast);
      }
    }

    return reindexed;
  }

  function handleAddToQueue(e) {
    e.preventDefault();

    if (!name.trim()) {
      alert("Digite o nome do cliente.");
      return;
    }

    if (!cpf.trim() || cpf.length < 14) {
      alert("Digite um CPF válido.");
      return;
    }

    if (notifyWhatsApp && normalizePhone(phone).length < 10) {
      alert("Digite um telefone válido com DDD.");
      return;
    }

    const activeNumbers = queue.map((item) => item.number);
    const nextNumber = activeNumbers.length ? Math.max(...activeNumbers) + 1 : 1;

    const newTicket = {
      id: Date.now(),
      number: nextNumber,
      name: name.trim(),
      cpf,
      service,
      phone: notifyWhatsApp ? normalizePhone(phone) : "",
      notifyWhatsApp,
      notified: false,
      notificationSteps: [],
      status: "aguardando",
      joinedAt: new Date().toISOString(),
      position: null,
      estimatedMinutes: 0,
    };

    const updatedQueue = updateQueue([...queue, newTicket]);
    const savedTicket =
      updatedQueue.find((item) => item.id === newTicket.id) || newTicket;

    setLastTicket(savedTicket);
    saveLastTicket(savedTicket);

    setName("");
    setCpf("");
    setService(services[0] || "");
    setPhone("");
    setNotifyWhatsApp(true);
  }

  function handleCallNext() {
    const currentItem = getCurrentItem(queue);

    if (currentItem) {
      alert("Já existe um atendimento em andamento. Finalize o atual primeiro.");
      return;
    }

    const waiting = getWaitingQueue(queue);

    if (!waiting.length) {
      alert("Não há ninguém aguardando na fila.");
      return;
    }

    const nextItem = waiting[0];

    const updatedBase = queue.map((item) =>
      item.id === nextItem.id
        ? { ...item, status: "em_atendimento", position: 0, estimatedMinutes: 0 }
        : item
    );

    const reindexed = updateQueue(updatedBase);
    const withNotifications = applyNotifications(reindexed);
    const finalQueue = updateQueue(withNotifications);

    const updatedLast = finalQueue.find((item) => item.id === syncedLastTicket?.id);
    if (updatedLast) {
      setLastTicket(updatedLast);
      saveLastTicket(updatedLast);
    }
  }

  function handleFinishCurrent(itemFromButton) {
    const currentItem =
      itemFromButton?.status === "em_atendimento"
        ? itemFromButton
        : getCurrentItem(queue);

    if (!currentItem) {
      alert("Nenhum atendimento em andamento.");
      return;
    }

    const updatedQueue = queue.map((item) =>
      item.id === currentItem.id
        ? { ...item, status: "finalizado", finishedAt: new Date().toISOString() }
        : item
    );

    const reindexed = updateQueue(updatedQueue);
    const withNotifications = applyNotifications(reindexed);
    updateQueue(withNotifications);
  }

  function handleRemove(item) {
    const confirmed = window.confirm(
      `Deseja remover a senha ${item.number} de ${item.name}?`
    );

    if (!confirmed) return;

    const updatedQueue = queue.filter((queueItem) => queueItem.id !== item.id);
    updateQueue(updatedQueue);

    if (syncedLastTicket?.id === item.id) {
      setLastTicket(null);
      localStorage.removeItem(LAST_TICKET_KEY);
    }
  }

  function handleReset() {
    const confirmed = window.confirm("Deseja realmente limpar toda a fila?");

    if (!confirmed) return;

    setQueue([]);
    setLastTicket(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_TICKET_KEY);
  }

  function handleAdminTabClick() {
    setActiveTab("admin");
    setLoginError("");
  }

  function handleAdminLogin() {
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setLoginError("");
      setPasswordInput("");
      setAdminView("painel");
      return;
    }

    setLoginError("Senha administrativa inválida.");
  }

  function handleAdminLogout() {
    setIsAdminAuthenticated(false);
    setPasswordInput("");
    setLoginError("");
    setAdminView("painel");
    setActiveTab("cliente");
  }

  function handleAddService() {
    const trimmed = newService.trim();

    if (!trimmed) {
      alert("Digite o nome do serviço.");
      return;
    }

    const alreadyExists = services.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase()
    );

    if (alreadyExists) {
      alert("Esse serviço já está cadastrado.");
      return;
    }

    const updatedServices = [...services, trimmed];
    setServices(updatedServices);
    localStorage.setItem(SERVICES_KEY, JSON.stringify(updatedServices));
    setNewService("");
  }

  function handleRemoveService(serviceName) {
    if (services.length === 1) {
      alert("É necessário manter pelo menos um serviço cadastrado.");
      return;
    }

    const confirmed = window.confirm(
      `Deseja excluir o serviço "${serviceName}"?`
    );

    if (!confirmed) return;

    const updatedServices = services.filter((item) => item !== serviceName);
    setServices(updatedServices);
    localStorage.setItem(SERVICES_KEY, JSON.stringify(updatedServices));

    if (service === serviceName) {
      setService(updatedServices[0]);
    }
  }

  return (
    <div className="semfila-app">
      <header className="topbar">
        <div>
          <h1>SEMFILA</h1>
          <p>
            Fluxo Ativo - Sistema de Gestão de Filas Inteligentes.
          </p>
        </div>

        <div className="tabs">
          <button
            className={activeTab === "cliente" ? "tab active" : "tab"}
            onClick={() => setActiveTab("cliente")}
            type="button"
          >
            Área do Cliente
          </button>

          <button
            className={activeTab === "admin" ? "tab active" : "tab"}
            onClick={handleAdminTabClick}
            type="button"
          >
            Painel de Atendimento
          </button>
        </div>
      </header>

      {activeTab === "cliente" ? (
        <ClientPage
          queue={queue}
          lastTicket={syncedLastTicket}
          name={name}
          setName={setName}
          cpf={cpf}
          setCpf={setCpf}
          services={services}
          service={service}
          setService={setService}
          phone={phone}
          setPhone={setPhone}
          notifyWhatsApp={notifyWhatsApp}
          setNotifyWhatsApp={setNotifyWhatsApp}
          onAddToQueue={handleAddToQueue}
        />
      ) : isAdminAuthenticated ? (
        adminView === "painel" ? (
          <AdminPage
            queue={queue}
            onCallNext={handleCallNext}
            onFinishCurrent={handleFinishCurrent}
            onRemove={handleRemove}
            onReset={handleReset}
            onLogout={handleAdminLogout}
            onOpenServices={() => setAdminView("servicos")}
          />
        ) : (
          <AdminServicesPage
            services={services}
            newService={newService}
            setNewService={setNewService}
            onAddService={handleAddService}
            onRemoveService={handleRemoveService}
            onBack={() => setAdminView("painel")}
            onLogout={handleAdminLogout}
          />
        )
      ) : (
        <AdminLogin
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          onLogin={handleAdminLogin}
          loginError={loginError}
        />
      )}
    </div>
  );
}
