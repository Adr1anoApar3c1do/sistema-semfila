* SemFila

** Descrição do Projeto **

O **SemFila**
É um sistema web desenvolvido com o objetivo de modernizar e facilitar o gerenciamento de filas de atendimento, permitindo que o usuário realize sua entrada na fila de forma digital, sem a necessidade de permanecer fisicamente no local aguardando sua vez.

A proposta do projeto é oferecer uma solução simples, prática e acessível para ambientes com grande fluxo de atendimento, como postos de saúde, centros de atendimento, repartições públicas, clínicas, escolas, eventos e demais locais que utilizam controle de senhas ou ordem de chegada.

O sistema permite que o cidadão acompanhe sua posição na fila, visualize o tempo estimado de atendimento e receba uma mensagem de aviso pelo WhatsApp quando sua vez estiver próxima. Além disso, o projeto possui um painel administrativo para gerenciamento dos atendimentos e controle da fila.

---

** Objetivo **

O principal objetivo do projeto é reduzir o tempo de espera presencial, melhorar a organização dos atendimentos e proporcionar mais conforto aos usuários.

Com o SemFila, o usuário pode entrar na fila pelo celular, acompanhar sua situação em tempo real e comparecer ao local apenas quando estiver próximo de ser atendido.

---

** Funcionalidades **

O sistema conta com as seguintes funcionalidades:

- Cadastro do usuário na fila de atendimento;
- Escolha do serviço desejado;
- Registro de nome, CPF e telefone;
- Geração automática de senha;
- Acompanhamento da posição na fila;
- Exibição do tempo estimado de atendimento;
- Painel administrativo protegido por senha;
- Chamada da próxima senha;
- Finalização do atendimento atual;
- Cancelamento ou remoção de senhas;
- Cadastro e gerenciamento de serviços;
- Integração com WhatsApp para envio de mensagem ao próximo usuário da fila;
- Armazenamento dos dados no Firebase;
- Interface responsiva para uso em computador e celular.

---

** Tecnologias Utilizadas **

O projeto foi desenvolvido utilizando as seguintes tecnologias:

- **JavaScript**: linguagem principal utilizada no desenvolvimento da aplicação;
- **React**: biblioteca JavaScript utilizada para construção da interface;
- **Vite**: ferramenta utilizada para criação e execução do projeto React;
- **CSS**: utilizado para estilização das telas;
- **Firebase Firestore**: banco de dados em nuvem utilizado para armazenar filas e serviços;
- **WhatsApp**: utilizado para envio de mensagens de aviso ao usuário;
- **GitHub**: utilizado para versionamento e armazenamento do código-fonte.

---

** Estrutura do Projeto **

A estrutura principal do projeto está organizada da seguinte forma:

```text
sistema-semfila/
│
├── public/
│   └── Arquivos públicos da aplicação
│
├── src/
│   ├── App.jsx
│   ├── SemFilaApp.jsx
│   ├── SemFilaApp.css
│   ├── firebase.js
│   └── main.jsx
│
├── package.json
├── package-lock.json
├── index.html
├── vite.config.js
└── README.md
