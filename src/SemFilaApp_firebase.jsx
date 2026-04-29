import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import "./SemFilaApp.css";
import {
  Bell,
  LayoutDashboard,
  PlusCircle,
  Ticket,
  Phone,
  Lock,
  LogOut,
  Smartphone,
} from "lucide-react";

const STORAGE_KEY = "semfila_queue_v3";
const LAST_TICKET_KEY = "semfila_last_ticket_v3";
const SERVICES_KEY = "semfila_services_v1";
const AVG_SERVICE_MINUTES = 10;
const ADMIN_PASSWORD = "1234";

const DEFAULT_SERVICES = [
  "Retirada de Exames",
  "Entrega de Exames",
  "Coleta de Exames",
  "Clínico Geral",
  "Pediatria",
  "Ginecologia / Saúde da mulher",
  "Vacinação",
  "Enfermagem",
  "Odontologia",
  "Psicologia",
  "Ortopedia",
  "Fonoaudiologia",
  "Neuropediatria",
  "Assistência Social"
];

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function formatCpf(value) {
  const numbers = String(value || "").replace(/\D/g, "").slice(0, 11);

  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
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

function formatTicketNumber(number) {
  if (!number) return "-";
  return `A${String(number).padStart(3, "0")}`;
}

function buildWhatsAppLink(phone, message) {
  const cleanPhone = normalizePhone(phone);
  const phoneWithCountry = cleanPhone.startsWith("55")
    ? cleanPhone
    : `55${cleanPhone}`;

  return `whatsapp://send?phone=${phoneWithCountry}&text=${encodeURIComponent(message)}`;
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
      return status || "-";
  }
}

function reindexQueue(queue) {
  const waiting = queue
    .filter((item) => item.status === "aguardando")
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    .map((item, index) => {
      const position = index + 1;
      return {
        ...item,
        position,
        estimatedMinutes: estimateMinutes(position),
      };
    });

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

  return `Olá, ${ticket.name}. Sua senha no SemFila é ${formatTicketNumber(
    ticket.number
  )}. Você é o próximo a ser atendido. Tempo estimado: ${estimatedMinutes} minuto(s). Serviço: ${ticket.service}. Dirija-se ao atendimento em breve.`;
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

    if (!item.notified) {
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
    return <div className="empty-box">Nenhuma senha gerada ainda neste navegador.</div>;
  }

  return (
    <div className="ticket-card">
      <div className="ticket-main">
        <div>
          <span className="ticket-label">Senha</span>
          <strong className="ticket-number">{formatTicketNumber(ticket.number)}</strong>
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
        <p><strong>Nome:</strong> {ticket.name}</p>
        <p><strong>CPF:</strong> {ticket.cpf || "-"}</p>
        <p><strong>Serviço:</strong> {ticket.service}</p>
        <p><strong>Entrada:</strong> {formatDateTime(ticket.joinedAt)}</p>
        {ticket.phone ? <p><strong>Telefone:</strong> {formatPhone(ticket.phone)}</p> : null}
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
                  <td>{formatTicketNumber(item.number)}</td>
                  <td>{item.name}</td>
                  <td>{item.cpf || "-"}</td>
                  <td>{item.service}</td>
                  <td>{getStatusLabel(item.status)}</td>
                  <td>{item.status === "em_atendimento" ? "Agora" : item.position ?? "-"}</td>
                  <td>{item.status === "aguardando" ? `${item.estimatedMinutes ?? 0} min` : "-"}</td>
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
          <div className="section-icon blue"><PlusCircle size={18} /></div>
          <div>
            <h2>Cadastro do usuário</h2>
            <p>Faça seu cadastro, escolha o serviço desejado e gere sua senha digital.</p>
          </div>
        </div>

        <form onSubmit={onAddToQueue} className="form-grid">
          <div className="form-group">
            <label>Nome completo:</label>
            <input
              type="text"
              placeholder="Digite seu nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-row two-columns">
            <div className="form-group">
              <label>CPF:</label>
              <input
                type="text"
                placeholder="999.999.999-99"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                maxLength={14}
              />
            </div>

            <div className="form-group">
              <label>Telefone / WhatsApp:</label>
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
            <label>Serviço desejado:</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((option) => (
                <option key={option} value={option}>{option}</option>
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

          <button className="primary-btn" type="submit">Gerar senha e entrar na fila</button>
        </form>
      </section>

      <section className="card">
        <div className="section-title">
          <div className="section-icon green"><Ticket size={18} /></div>
          <div>
            <h2>Acompanhamento</h2>
            <p>Consulte a última senha gerada neste navegador.</p>
          </div>
        </div>

        <TicketCard ticket={lastTicket} />
      </section>

      <section className="card info-card">
        <div className="section-title">
          <div className="section-icon yellow"><Bell size={18} /></div>
          <div>
            <h2>Painel rápido</h2>
            <p>Resumo da fila em tempo real.</p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-box"><span>Total aguardando</span><strong>{waiting.length}</strong></div>
          <div className="stat-box"><span>Em atendimento</span><strong>{current ? 1 : 0}</strong></div>
          <div className="stat-box"><span>Próxima senha</span><strong>{formatTicketNumber(waiting[0]?.number)}</strong></div>
          <div className="stat-box"><span>Tempo médio</span><strong>{AVG_SERVICE_MINUTES} min</strong></div>
        </div>
      </section>

      <section className="card notes-card">
        <h3>Projeto SemFila - V3 - Versão Web</h3>
        
      </section>
    </div>
  );
}

function MobileUserPage({
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


  const [showTracking, setShowTracking] = useState(false);

  const current = getCurrentItem(queue);
  const waiting = getWaitingQueue(queue);
  const nextTicket = waiting[0];

  
  return (
    <div className="mobile-page-wrapper">
      <div className="mobile-phone-frame">
        <div className="mobile-status-bar">
          <span>Sem Fila</span>
          <span>SemFila</span>
        </div>

        <div className="mobile-header">
          <div className="mobile-logo"><Smartphone size={22} /></div>
          <div>
            <h2>SemFila Mobile</h2>
            <p>Entre na fila pelo celular</p>
          </div>
        </div>

        <form onSubmit={onAddToQueue} className="mobile-form">
          <div className="mobile-field">
            <label>Nome completo</label>
            <input
              type="text"
              placeholder="Digite seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="mobile-field">
            <label>CPF</label>
            <input
              type="text"
              placeholder="999.999.999-99"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              maxLength={14}
            />
          </div>

          <div className="mobile-field">
            <label>Telefone / WhatsApp</label>
            <input
              type="tel"
              placeholder="(15) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </div>

          <div className="mobile-field">
            <label>Serviço desejado</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <label className="mobile-check">
            <input
              type="checkbox"
              checked={notifyWhatsApp}
              onChange={(e) => setNotifyWhatsApp(e.target.checked)}
            />
            Receber aviso pelo WhatsApp
          </label>

          <button className="mobile-main-btn" type="submit">Entrar na fila</button>
        </form>

        <div className="mobile-ticket-area">
          {lastTicket ? (
            <>
              <span>Sua senha digital</span>
              <strong>{formatTicketNumber(lastTicket.number)}</strong>

              <div className="mobile-ticket-info">
                <p><b>Status:</b> {getStatusLabel(lastTicket.status)}</p>
                <p>
                  <b>Posição:</b>{" "}
                  {lastTicket.status === "em_atendimento"
                    ? "Sendo atendido"
                    : lastTicket.status === "finalizado"
                    ? "-"
                    : `${lastTicket.position ?? "-"}º`}
                </p>
                <p>
                  <b>Tempo estimado:</b>{" "}
                  {lastTicket.status === "aguardando"
                    ? `${lastTicket.estimatedMinutes ?? 0} min`
                    : "Agora"}
                </p>
                <p><b>Serviço:</b> {lastTicket.service}</p>
              </div>
            </>
          ) : (
            <p className="mobile-empty">Após o cadastro, sua senha aparecerá aqui.</p>
          )}

                  <button
          className="mobile-track-btn"
          type="button"
          onClick={() => setShowTracking(!showTracking)}
        >
          {showTracking ? "Ocultar acompanhamento" : "Acompanhar fila"}
        </button>

        {showTracking ? (
          <div className="mobile-tracking-box">
            <h3>Acompanhamento da fila</h3>

            <p>
              <b>Senha em atendimento:</b>{" "}
              {current ? formatTicketNumber(current.number) : "Nenhuma"}
            </p>

            <p>
              <b>Próxima senha:</b>{" "}
              {nextTicket ? formatTicketNumber(nextTicket.number) : "Nenhuma"}
            </p>

            <p>
              <b>Total aguardando:</b> {waiting.length}
            </p>

            <p>
              <b>Minha posição:</b>{" "}
              {lastTicket?.status === "aguardando"
                ? `${lastTicket.position ?? "-"}º`
                : lastTicket?.status === "em_atendimento"
                ? "Sendo atendido"
                : lastTicket?.status === "finalizado"
                ? "Finalizado"
                : "-"}
            </p>

            <p>
              <b>Tempo estimado:</b>{" "}
              {lastTicket?.status === "aguardando"
                ? `${lastTicket.estimatedMinutes ?? 0} min`
                : lastTicket
                ? "Agora"
                : "-"}
            </p>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function AdminLogin({ passwordInput, setPasswordInput, onLogin, loginError }) {
  return (
    <div className="page-grid">
      <section className="card admin-login-card">
        <div className="section-title">
          <div className="section-icon dark"><Lock size={18} /></div>
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

          <button className="primary-btn" type="button" onClick={onLogin}>Entrar no painel</button>
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
            <div className="section-icon dark"><LayoutDashboard size={18} /></div>
            <div>
              <h2 className="admin-title">Painel de atendimento</h2>
              <p className="admin-subtitle">Gerencie a fila, chame clientes e finalize atendimentos.</p>
            </div>
          </div>

          <button className="secondary-btn admin-exit-btn" type="button" onClick={onLogout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-box"><span>Aguardando</span><strong>{waiting.length}</strong></div>
          <div className="stat-box"><span>Em atendimento</span><strong>{current.length}</strong></div>
          <div className="stat-box"><span>Finalizados</span><strong>{finished.length}</strong></div>
          <div className="stat-box"><span>Espera média</span><strong>{averageWait} min</strong></div>
        </div>

        <div className="admin-buttons">
          <button className="primary-btn" type="button" onClick={onCallNext}>Chamar próxima senha</button>
          <button className="primary-btn" type="button" onClick={onFinishCurrent}>Finalizar atendimento atual</button>
          <button className="primary-btn" type="button" onClick={onOpenServices}>Cadastrar Novo Serviço</button>
          <button className="danger-btn" type="button" onClick={onReset}>Limpar fila</button>
        </div>
      </section>

      <QueueTable
        title="Em atendimento"
        items={current}
        emptyText="Nenhum atendimento em andamento."
        actions={[{ label: "Finalizar", variant: "success", onClick: onFinishCurrent }]}
      />

      <QueueTable
        title="Aguardando"
        items={waiting}
        emptyText="Nenhuma pessoa aguardando na fila."
        actions={[{ label: "Remover", variant: "danger", onClick: onRemove }]}
      />

      <QueueTable
        title="Finalizados"
        items={finished}
        emptyText="Nenhum atendimento finalizado."
        actions={[{ label: "Remover", variant: "danger", onClick: onRemove }]}
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
            <div className="section-icon blue"><PlusCircle size={18} /></div>
            <div>
              <h2 className="admin-title">Cadastrar Serviços</h2>
              <p className="admin-subtitle">Adicione ou remova os serviços disponíveis no atendimento.</p>
            </div>
          </div>

          <button className="primary-btn admin-exit-btn" type="button" onClick={onLogout}>
            <LogOut size={16} />
            Área do Cliente
          </button>
        </div>

        <div className="service-back-row">
          <button type="button" className="primary-btn" onClick={onBack}>Painel de Atendimento</button>
        </div>

        <div className="service-manager">
          <div className="service-input-row">
            <input
              type="text"
              placeholder="Digite o nome do serviço"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
            />

            <button type="button" className="primary-btn services-side-btn" onClick={onAddService}>Adicionar Serviço</button>
          </div>

          <div className="service-list">
            {services.map((item) => (
              <div key={item} className="service-item">
                <span>{item}</span>
                <button type="button" className="mini-btn danger" onClick={() => onRemoveService(item)}>Excluir</button>
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
  const [lastTicketId, setLastTicketId] = useState(() => {
    return localStorage.getItem(LAST_TICKET_KEY) || "";
  });

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [service, setService] = useState(DEFAULT_SERVICES[0]);
  const [serviceDocs, setServiceDocs] = useState([]);
  const [newService, setNewService] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
  async function resetDefaultServices() {
    const servicesSnapshot = await getDocs(collection(db, "services"));
    const batch = writeBatch(db);

    servicesSnapshot.docs.forEach((serviceDoc) => {
      batch.delete(doc(db, "services", serviceDoc.id));
    });

    DEFAULT_SERVICES.forEach((serviceName, index) => {
      const serviceRef = doc(collection(db, "services"));
      batch.set(serviceRef, {
        name: serviceName,
        createdAt: Date.now() + index,
      });
    });

    await batch.commit();
  }

  resetDefaultServices().catch((error) => {
    console.error("Erro ao redefinir serviços padrão:", error);
  });
}, []);

  useEffect(() => {
    const servicesQuery = query(collection(db, "services"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      servicesQuery,
      (snapshot) => {
        const loadedServices = snapshot.docs.map((serviceDoc) => ({
          id: serviceDoc.id,
          ...serviceDoc.data(),
        }));

        if (!loadedServices.length) {
          setServices(DEFAULT_SERVICES);
          setService(DEFAULT_SERVICES[0]);
          setServiceDocs([]);
          return;
        }

        const serviceNames = loadedServices.map((item) => item.name);
        setServiceDocs(loadedServices);
        setServices(serviceNames);

        setService((currentService) => {
          if (serviceNames.includes(currentService)) return currentService;
          return serviceNames[0] || "";
        });
      },
      (error) => {
        console.error("Erro ao carregar serviços do Firebase:", error);
        alert("Não foi possível carregar os serviços do Firebase.");
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const queueQuery = query(collection(db, "queue"), orderBy("joinedAt", "asc"));

    const unsubscribe = onSnapshot(
      queueQuery,
      (snapshot) => {
        const loadedQueue = snapshot.docs.map((queueDoc) => ({
          docId: queueDoc.id,
          id: queueDoc.id,
          ...queueDoc.data(),
        }));

        setQueue(reindexQueue(loadedQueue));
      },
      (error) => {
        console.error("Erro ao carregar fila do Firebase:", error);
        alert("Não foi possível carregar a fila do Firebase.");
      }
    );

    return () => unsubscribe();
  }, []);

  const syncedLastTicket = useMemo(() => {
    if (!lastTicketId) return null;
    return queue.find((item) => item.docId === lastTicketId) || null;
  }, [queue, lastTicketId]);

  async function handleAddToQueue(e) {
    e.preventDefault();

    if (!name.trim()) {
      alert("Digite o nome do usuário.");
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

    const usedNumbers = queue.map((item) => Number(item.number) || 0);
    const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

    const newTicket = {
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

    try {
      const docRef = await addDoc(collection(db, "queue"), newTicket);
      setLastTicketId(docRef.id);
      localStorage.setItem(LAST_TICKET_KEY, docRef.id);

      setName("");
      setCpf("");
      setService(services[0] || "");
      setPhone("");
      setNotifyWhatsApp(true);

      alert(`Cadastro realizado com sucesso! Sua senha é ${formatTicketNumber(nextNumber)}.`);
    } catch (error) {
      console.error("Erro ao cadastrar na fila:", error);
      alert("Não foi possível cadastrar na fila. Verifique a conexão com o Firebase.");
    }
  }

  async function handleCallNext() {
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
  const nextToNotify = waiting[1];

  try {
    await updateDoc(doc(db, "queue", nextItem.docId), {
      status: "em_atendimento",
      position: 0,
      estimatedMinutes: 0,
    });

    if (
      nextToNotify?.notifyWhatsApp &&
      nextToNotify?.phone &&
      !nextToNotify.notified
    ) {
      sendWhatsAppNotification(nextToNotify, 0);

      await updateDoc(doc(db, "queue", nextToNotify.docId), {
        notified: true,
        notificationSteps: [0],
      });
    }
  } catch (error) {
    console.error("Erro ao chamar próxima senha:", error);
    alert("Não foi possível chamar a próxima senha.");
  }
}

  async function handleFinishCurrent(itemFromButton) {
  const currentItem =
    itemFromButton?.status === "em_atendimento"
      ? itemFromButton
      : getCurrentItem(queue);

  if (!currentItem) {
    alert("Nenhum atendimento em andamento.");
    return;
  }

  try {
    await updateDoc(doc(db, "queue", currentItem.docId), {
      status: "finalizado",
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao finalizar atendimento:", error);
    alert("Não foi possível finalizar o atendimento.");
  }
}

  async function handleRemove(item) {
    const confirmed = window.confirm(
      `Deseja remover a senha ${formatTicketNumber(item.number)} de ${item.name}?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "queue", item.docId));

      if (syncedLastTicket?.docId === item.docId) {
        setLastTicketId("");
        localStorage.removeItem(LAST_TICKET_KEY);
      }
    } catch (error) {
      console.error("Erro ao remover senha:", error);
      alert("Não foi possível remover a senha.");
    }
  }

  async function handleReset() {
    const confirmed = window.confirm("Deseja realmente limpar toda a fila?");

    if (!confirmed) return;

    try {
      const snapshot = await getDocs(collection(db, "queue"));
      const batch = writeBatch(db);

      snapshot.docs.forEach((queueDoc) => {
        batch.delete(doc(db, "queue", queueDoc.id));
      });

      await batch.commit();
      setLastTicketId("");
      localStorage.removeItem(LAST_TICKET_KEY);
    } catch (error) {
      console.error("Erro ao limpar fila:", error);
      alert("Não foi possível limpar a fila.");
    }
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

  async function handleAddService() {
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

    try {
      await addDoc(collection(db, "services"), {
        name: trimmed,
        createdAt: Date.now(),
      });
      setNewService("");
    } catch (error) {
      console.error("Erro ao adicionar serviço:", error);
      alert("Não foi possível adicionar o serviço.");
    }
  }

  async function handleRemoveService(serviceName) {
    if (services.length === 1) {
      alert("É necessário manter pelo menos um serviço cadastrado.");
      return;
    }

    const confirmed = window.confirm(`Deseja excluir o serviço "${serviceName}"?`);
    if (!confirmed) return;

    const serviceToRemove = serviceDocs.find((item) => item.name === serviceName);

    if (!serviceToRemove) {
      alert("Não foi possível localizar esse serviço no Firebase.");
      return;
    }

    try {
      await deleteDoc(doc(db, "services", serviceToRemove.id));

      if (service === serviceName) {
        const remainingServices = services.filter((item) => item !== serviceName);
        setService(remainingServices[0] || "");
      }
    } catch (error) {
      console.error("Erro ao remover serviço:", error);
      alert("Não foi possível remover o serviço.");
    }
  }

  return (
    <div className="semfila-app">
      <header className="topbar">
        <div>
          <h1>SEMFILA</h1>
          <p>Fluxo Ativo - Sistema de Gestão de Filas Inteligentes.</p>
        </div>

        <div className="tabs">
          <button
            className={activeTab === "mobile" ? "tab active" : "tab"}
            onClick={() => setActiveTab("mobile")}
            type="button"
          >
            Mobile
          </button>

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

      {activeTab === "mobile" ? (
        <MobileUserPage
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
      ) : activeTab === "cliente" ? (
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
