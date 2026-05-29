#!/bin/bash
echo '🚀 Building production...'
docker compose build mentor-web && docker compose up -d mentor-web
echo '✓ Productie actief'
