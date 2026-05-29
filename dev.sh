#!/bin/bash
echo '🔧 Switching to dev mode (hot reload)...'
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mentor-web
echo '✓ Dev mode actief — wijzig een bestand en de browser refresht automatisch'
