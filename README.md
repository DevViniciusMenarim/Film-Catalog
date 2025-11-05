Catálogo de Filmes (Full-Stack)

Este é um projeto full-stack de um catálogo de filmes que permite aos usuários pesquisar filmes usando a API do TMDB e salvar/remover seus favoritos em um banco de dados MySQL pessoal.

O projeto é dividido em duas partes principais: O "Backend", uma API RESTful construída em Node.js e Express, responsável por se comunicar com a API do TMDB e com o banco de dados. E o "Frontend", uma aplicação moderna em React (criada com Vite), com uma interface inspirada no IMDb (tema escuro) para consumir a API do Backend.

As funcionalidades incluem: Pesquisa dinâmica de filmes em tempo real na API do The Movie Database (TMDB). Gerenciamento de favoritos, permitindo adicionar e salvar filmes em uma lista. Persistência de dados, salvando os favoritos em um banco de dados MySQL. Interface reativa para visualização e remoção de favoritos com atualização instantânea. E uma interface profissional com tema escuro inspirado no IMDb, com estados de "carregando" e "erro" para o usuário.

As tecnologias utilizadas no Backend são Node.js, Express.js, MySQL2 (Promise), dotenv e CORS. O Frontend utiliza React 18+ (Hooks), Vite e CSS Moderno (Variáveis). O banco de dados é o MySQL.

Como Executar o Projeto

Siga estas instruções para rodar o projeto localmente na sua máquina.

Os pré-requisitos são: Node.js (v18 ou superior), um servidor MySQL (MySQL Workbench, XAMPP, etc.) e uma Chave de API do TMDB (consiga a sua no site do TMDB).

Primeiro, faça a configuração do Banco de Dados (MySQL). Execute os seguintes comandos no seu MySQL para criar o banco e a tabela:

CREATE DATABASE movie_catalog;

USE movie_catalog;

CREATE TABLE favorites ( tmdb_id INT NOT NULL, title VARCHAR(255) NOT NULL, PRIMARY KEY (tmdb_id) );

Em segundo lugar, configure o Backend (API). Navegue até a pasta do backend com o comando: cd Backend Instale as dependências com o comando: npm install Crie um arquivo chamado .env na pasta Backend e cole o conteúdo abaixo, substituindo com suas credenciais:

DB_HOST=localhost DB_USER=root DB_PASSWORD=sua_senha_do_mysql DB_DATABASE=movie_catalog TMDB_API_KEY=sua_chave_de_api_do_tmdb

Inicie o servidor do backend com o comando: node server.js O servidor estará rodando em http://localhost:3000.

Em terceiro lugar, configure o Frontend (React). Abra um novo terminal (mantenha o terminal do backend rodando!). Navegue até a pasta do frontend com o comando: cd Frontend Instale as dependências com o comando: npm install Inicie a aplicação React (Vite) com o comando: npm run dev O Vite informará o endereço para abrir no navegador, geralmente http://localhost:5173.

Pronto! Agora é só acessar a aplicação no seu navegador (ex: http://localhost:5173) e usar o catálogo!