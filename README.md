Catálogo de Filmes (Full-Stack)
Este é um projeto full-stack de um catálogo de filmes que permite aos usuários pesquisar filmes usando a API do TMDB e salvar/remover seus favoritos em um banco de dados MySQL pessoal.

O projeto é dividido em duas partes principais:

Backend: Uma API RESTful construída em Node.js e Express, responsável por se comunicar com a API do TMDB e com o banco de dados.

Frontend: Uma aplicação moderna em React (criada com Vite), com uma interface inspirada no IMDb (tema escuro) para consumir a API do Backend.

Funcionalidades
Pesquisa Dinâmica: Busca de filmes em tempo real na API do The Movie Database (TMDB).

Gerenciamento de Favoritos: Adicione e salve filmes em uma lista de favoritos.

Persistência de Dados: Os favoritos são salvos em um banco de dados MySQL.

Interface Reativa: Visualização e remoção de favoritos com atualização instantânea da interface.

Interface Profissional: Tema escuro inspirado no IMDb, com estados de "carregando" e "erro" para o usuário.

Tecnologias Utilizadas
Backend
Node.js

Express.js

MySQL2 (Promise)

dotenv

CORS

Frontend
React 18+ (Hooks)

Vite

CSS Moderno (Variáveis)

Banco de Dados
MySQL

Como Executar o Projeto
Siga estas instruções para rodar o projeto localmente na sua máquina.

Pré-requisitos
Node.js (v18 ou superior)

Um servidor MySQL (MySQL Workbench, XAMPP, etc.)

Uma Chave de API do TMDB (consiga a sua no site do TMDB)

1. Configuração do Banco de Dados (MySQL)
Primeiro, execute os seguintes comandos no seu MySQL para criar o banco e a tabela:

CREATE DATABASE movie_catalog;

USE movie_catalog;

CREATE TABLE favorites ( tmdb_id INT NOT NULL, title VARCHAR(255) NOT NULL, PRIMARY KEY (tmdb_id) );

2. Configuração do Backend (API)
Navegue até a pasta do backend: cd Backend

Instale as dependências: npm install

Crie um arquivo chamado .env na pasta Backend e cole o conteúdo abaixo, substituindo com suas credenciais:

DB_HOST=localhost DB_USER=root DB_PASSWORD=sua_senha_do_mysql DB_DATABASE=movie_catalog TMDB_API_KEY=sua_chave_de_api_do_tmdb

Inicie o servidor do backend: node server.js

O servidor estará rodando em http://localhost:3000.

3. Configuração do Frontend (React)
Abra um novo terminal (mantenha o terminal do backend rodando!).

Navegue até a pasta do frontend: cd Frontend

Instale as dependências: npm install

Inicie a aplicação React (Vite): npm run dev

O Vite informará o endereço para abrir no navegador, geralmente http://localhost:5173.

4. Pronto!
Agora é só acessar a aplicação no seu navegador (ex: http://localhost:5173) e usar o catálogo!