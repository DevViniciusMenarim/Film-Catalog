# 🎬 Catálogo de Filmes | Full-Stack Application

Uma aplicação full-stack moderna que funciona como um catálogo interativo de filmes. O sistema consome dados em tempo real da API do TMDB (The Movie Database) e permite ao usuário gerenciar uma lista personalizada de favoritos com persistência completa em um banco de dados relacional local.

O projeto foi desenvolvido seguindo boas práticas de separação de conceitos (*Separation of Concerns*), dividindo-se de forma clara entre uma API RESTful estável e um frontend reativo com foco em experiência do usuário (UX).

---

## 🛠️ Stack Tecnológica e Ecossistema

O projeto utiliza tecnologias consolidadas no mercado para garantir performance, tipagem ágil e modularidade.

### Backend & Persistência
* **Runtime:** Node.js (v18+)
* **Framework Web:** Express.js (Roteamento e Middlewares)
* **Driver de Banco de Dados:** MySQL2 (utilizando suporte a Promises para código assíncrono limpo)
* **Segurança:** `dotenv` (isolamento de variáveis de ambiente sensíveis) e `CORS` (controle de acesso HTTP)

### Frontend & Interface
* **Biblioteca Core:** React 18+ (arquitetura baseada em Functional Components e Hooks)
* **Ferramenta de Build:** Vite (desempenho otimizado de Hot Module Replacement - HMR)
* **Estilização:** CSS3 Moderno estruturado com Variáveis Nativas (Custom Properties) para consistência visual

### Banco de Dados
* **SGBD:** MySQL (Modelo Relacional)

---

## 🚀 Funcionalidades Principais

* **Consumo de API Externa e Pesquisa Dinâmica:** Busca assíncrona de títulos diretamente do servidor do TMDB, com resposta em tempo real conforme a interação do usuário.
* **Gerenciamento de Estado de Favoritos:** Operações completas de adição e remoção de filmes diretamente conectados à interface.
* **Persistência de Dados (CRUD parcial):** Garantia de que os favoritos persistam entre sessões por meio de queries seguras no MySQL.
* **Interface Reativa e UX Consistente:** Design fluido com tratamento visual explícito para estados de carregamento (*loading states*) e gerenciamento amigável de erros de rede.
* **Tema Escuro Premium:** Interface inteiramente inspirada na identidade visual clássica do IMDb, otimizada para o consumo de mídia.

---

## 📂 Estrutura do Projeto

O repositório é organizado de forma modular em duas pastas principais na raiz:

├── Backend/          # Servidor Express, configuração do banco de dados e rotas da API
└── Frontend/         # Aplicação React, componentes visuais e consumo de serviços

---

## ⚙️ Configuração do Ambiente e Instalação

### Pré-requisitos
Antes de iniciar, certifique-se de ter instalado em sua máquina:
* **Node.js** (versão 18 ou superior)
* **Servidor MySQL** ativo (via Workbench, XAMPP, Docker ou CLI)
* Uma **Chave de API do TMDB** (disponível gratuitamente na aba de desenvolvedor do site do TMDB)

---

### Passo 1: Modelagem do Banco de Dados

Conecte-se ao seu servidor MySQL através do seu cliente de preferência e execute o script abaixo para inicializar o banco de dados e a tabela estrutural:

CREATE DATABASE movie_catalog;
USE movie_catalog;

CREATE TABLE favorites (
    tmdb_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    PRIMARY KEY (tmdb_id)
);

---

### Passo 2: Configuração e Inicialização do Backend

1. Pelo terminal, navegue até o diretório do backend:
   cd Backend
   
2. Instale todas as dependências mapeadas no package.json:
   npm install
   
3. Crie um arquivo .env na raiz do diretório Backend e preencha-o com as suas credenciais locais e chave de API correspondente:
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha_do_mysql
   DB_DATABASE=movie_catalog
   TMDB_API_KEY=sua_chave_de_api_do_tmdb
   
4. Inicie o servidor Node.js:
   node server.js
   
   O serviço backend será inicializado e escutará requisições na porta local: http://localhost:3000

---

### Passo 3: Configuração e Inicialização do Frontend

1. Abra uma nova janela de terminal (mantenha o terminal do backend rodando em segundo plano) e acesse a pasta do frontend:
   cd Frontend
   
2. Instale as dependências necessárias para a interface:
   npm install
   
3. Execute o servidor de desenvolvimento do Vite:
   npm run dev
   
4. O terminal exibirá o endereço local gerado pelo Vite, normalmente http://localhost:5173. Abra o link indicado no seu navegador para interagir com a aplicação completa.

---

## 📌 Arquitetura da API (Rotas Principais sugeridas)

A comunicação entre as partes é realizada via JSON por meio dos seguintes endpoints:
* http://localhost:3000/ — Ponto de entrada e comunicação com banco de dados/TMDB.

---
Projeto desenvolvido com foco no estudo prático de integração Full-Stack, persistência de dados relacional e consumo assíncrono de APIs externas.
