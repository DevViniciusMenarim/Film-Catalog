# Backup e restauração

Os favoritos e a lista pessoal ficam no volume Docker `mysql_data`. `docker compose down` preserva o volume; `docker compose down --volumes` o remove com todos os dados. Antes de remover o volume ou importar um backup, salve uma cópia fora do repositório.

## Criar um backup

Com os serviços em execução, rode os comandos a partir da raiz do repositório. O arquivo será salvo em `../film-catalog-backup.sql`:

```sh
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --no-tablespaces -u "$MYSQL_USER" "$MYSQL_DATABASE" > /tmp/film-catalog-backup.sql'
```

Se a exportação terminar sem erro, copie o arquivo para fora do repositório e remova a cópia temporária:

```sh
docker compose cp db:/tmp/film-catalog-backup.sql ../film-catalog-backup.sql
docker compose exec -T db rm /tmp/film-catalog-backup.sql
```

## Restaurar um backup

A importação substitui os dados atuais das tabelas do catálogo. Faça primeiro um backup do estado atual e interrompa o uso da aplicação para evitar gravações durante a restauração. Mantenha o banco ligado e pare a interface e a API:

```sh
docker compose stop frontend backend
docker compose cp ../film-catalog-backup.sql db:/tmp/film-catalog-backup.sql
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" < /tmp/film-catalog-backup.sql'
```

Somente depois de uma importação concluída sem erro, remova a cópia temporária e reinicie os serviços:

```sh
docker compose exec -T db rm /tmp/film-catalog-backup.sql
docker compose up --build -d --wait
```

Se a importação falhar, verifique o erro antes de reiniciar a API e a interface. As senhas do MySQL são definidas quando o volume é criado; editar o `.env` depois não altera as contas desse volume.
