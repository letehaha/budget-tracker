# budget-tracker-be

## First run instructions

You need to make sure you have Docker installed. Current instruction is written
for the Docker v4.34.

### 1. Install dependencies

Use `npm ci` to install all the dependencies with correct versions.

### 2. Create corresponding env variables.

Project uses different `.env` files for each environment: `.env.development`,
`.env.production`, `.env.test`.

Locally you only need `.env.development` and `.env.test`.
You can create it based on the `.env.template`. Just copy `.env.template`, rename it and fill missing
variables.

**Important.** In the `.env.test` you will need to use another name for the DB,
since when tests are running, they're automatically filling and cleaning the DB,
so all your data from the DB used for development might be lost.

### 3. Start dev server

Run `npm run docker:dev` or `npm run docker:dev -- -d` to run it "in background".

It will be working in HMR mode, so any changes to the codebase will be reflected.

### 4. That's it ! 🎉🎉🎉

Now it should be accessible under the port that you defined in the `.env.development` file.

## Documentation

For detailed documentation about the backend services and architecture, see the [`docs/`](./docs/) folder:

- [Exchange Rates System](./docs/exchange-rates.md) - Hybrid exchange rates system (ApiLayer + Frankfurter)

### Troubleshoting:

1. Sometimes when running `npm run docker:dev` it might stuck running migrations
   due to DB connection issues. It's a very rare case, but if this happens,
   _**simply run the command again**_.

### Additional services for local development

#### pgAdmin (DB data viewer)

There's a pgAdmin available under the port `8001`. You can modify configuration for email and password of the dashboard in the env file. On the first setup, after logging in on the dashboard you will see "Add new server". Click on it, give it whatever Name you want.

Under the `Connection` tab you will need to fill a few fields:

- Host name/address – `db` (postgres service name from `docker/dev/docker-compose.yml` file)
- Username – value from the `APPLICATION_DB_USERNAME` env variable
- Password - value from the `APPLICATION_DB_PASSWORD` env variable

### Useful command for local development:

1. `npm run docker:dev:down` to stop containers. All the data will still be stored in the DB.
2. `npm run docker:dev:destroy` stops containers, and _**Completely destroys all the images, container and volumes**_. It means all the data will be erased from the DB. Useful when you want to test new migrations, or DB structure was damaged.
3. Use `docker:dev:run-in-container -- <some command>` to run any command inside running docker container. For example `docker:dev:run-in-container -- npm run migrate:dev` to run migrations and `docker:dev:run-in-container -- npm run migrate:dev:undo` to undo them.

<hr>
<hr>
<hr>

### If you don't want to use Docker

For whatever reason if you don't want not to use Docker, you still need to complete
first 2 steps described above, and then follow these instructions:

### 3. Setup Postgres

If you can access your user and you know how to create a DB, **you can ignore that section**.

If you don't know how to access your postgres user or DB:

1. Install Postgres.app for all existing postgres version [here](https://postgresapp.com/downloads.html) (it will install all needed Posgres versions).
2. Open the app, in the interface click on the "+" on the bottom left and add a new V11 server.
3. Click "Initialize" button from the interface.
4. If you have error "Post already in use", try to close apps that are using that port, or click on the server V11 in the interface and change port to 5433 (first option is much better)
5. Connect to default DB user using either

```sh
psql -h localhost -p 5432 -U postgres -d postgres
```

or just click on the "postgres" db in the Postgres.app. If you changed port on the previos step, update the port

6. Now run following commands to setup a user (update dumb values with your own):

1. You can omit first two steps if you don't mind using your current user.

```sql
CREATE USER myuser WITH PASSWORD 'secretpassword';
```

```sql
ALTER ROLE myuser SUPERUSER;
```

```sql
CREATE DATABASE "budget-tracker";
```

7. That's it.

### 4. Install Redis (if you don't have one):

1. Install Redis via `brew install redis`
2. Then `brew services start redis`

### 5. Run migrations

```sh
npm run migrate:dev
```

If you have an error running this command, you probably need to install Postgres. Read [the guide below](#setup-postgres).

If you encountered any errors during `npm run migrate:dev`, you can run
`npm run migrate-undo:dev` to undo migrations. If you still facing issues, you
can clear the DB using these two commands:

```sh
drop schema public cascade;
create schema public;
```

They will completely clean the DB and you will be able to run migrations again.

### 6. Start dev server

```sh
npm run dev
```

### 7. That's it! 🎉🎉🎉

But better use Docker 🙈
