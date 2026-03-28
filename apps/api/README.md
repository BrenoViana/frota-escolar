# api (NestJS)

## Persistencia com Postgres

1. Suba o banco (porta local 5435):
   - `docker compose up -d db`
2. Rode as migracoes:
   - PowerShell:
     - `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5435/frota'; npx prisma migrate dev`
3. Inicie a API:
   - PowerShell:
     - `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5435/frota'; npm run start:dev`
