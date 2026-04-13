# Деплой на Raspberry Pi 4

## Требования
- Raspberry Pi 4 (2GB+ RAM)
- Raspberry Pi OS **64-bit** (Bookworm)
- Подключение к интернету

## Быстрый старт

### 1. На Windows — упаковать проект
```powershell
cd C:\Users\dikii\Desktop\PROG\Cladue
tar -czf sbox-terminal.tar.gz sbox-terminal --exclude=node_modules --exclude=.next
```

### 2. Скопировать на RPi
```bash
scp sbox-terminal.tar.gz pi@<IP_RASPBERRY>:~/
```

### 3. На RPi — распаковать и запустить
```bash
cd ~
tar -xzf sbox-terminal.tar.gz
cd sbox-terminal

# Скопировать .env (или создать)
nano .env

# Запустить установку
bash deploy/rpi-setup.sh
```

## Управление

| Команда | Действие |
|---------|----------|
| `sudo systemctl status sbox-bot` | Статус бота |
| `sudo journalctl -u sbox-bot -f` | Логи в реальном времени |
| `sudo systemctl restart sbox-bot` | Перезапуск |
| `sudo systemctl stop sbox-bot` | Остановка |

## Потребление ресурсов

| Компонент | RAM |
|-----------|-----|
| PostgreSQL | ~80 MB |
| Redis | ~20 MB |
| Bot (tsx + Grammy) | ~80 MB |
| **Итого** | **~180 MB** |

RPi 4 с 2GB RAM справится с запасом.

## Обновление

```bash
cd ~/sbox-terminal
git pull  # или скопировать новые файлы
pnpm install
sudo systemctl restart sbox-bot
```

## Без Playwright (экономия RAM)

Worker со скрапером sbox.game использует Playwright + Chromium (~400MB RAM).
На RPi рекомендуется запускать worker только на основном ПК,
а на RPi — только бота + БД.
