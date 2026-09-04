# Setup Command Workflow

## Command
```bash
./scripts/setup.sh
```

## Description
Executes the automated first-time setup sequence for the entire project.

## Steps Executed
1. **Prerequisite Verification**: Checks for Node.js (>=24.0.0 LTS), Python (>=3.10.0), and Docker.
2. **Environment Initialization**: Copies `.env.example` to `.env` if `.env` does not already exist.
3. **Database Spin-up**: Launches PostgreSQL 18 Alpine container via `docker-compose.yml`.
4. **Node Dependency Installation**: Runs `npm install` for frontend packages.
5. **Database Migration**: Executes `npx prisma generate` and `npx prisma db push`.
6. **Python Virtual Environment**: Creates `tts-engine/venv`, activates it, and installs `tts-engine/requirements.txt`.
7. **Storage Directory Creation**: Prepares `storage/audio/` and `storage/voice-samples/`.
