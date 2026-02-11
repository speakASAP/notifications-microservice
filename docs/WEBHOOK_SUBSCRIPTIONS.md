# Webhook Subscriptions API

Notifications Microservice теперь поддерживает систему подписок на входящие письма через webhooks. Все тяжелые операции по обработке писем (парсинг, извлечение вложений, декодирование) выполняются в Notifications Microservice, а внешние сервисы получают уже обработанные данные в едином JSON формате.

## Регистрация подписки

### POST /webhooks/subscriptions

Регистрирует новый webhook для получения входящих писем.

**Request Body:**

{
  "serviceName": "helpdesk",
  "webhookUrl": "<https://speakasap.com/helpdesk/api/email/webhook/>",
  "secret": "optional-secret-for-signature-verification",
  "filters": {
    "to": ["support@speakasap.com", "help@speakasap.com"],
    "from": [],
    "subjectPattern": ".*"
  },
  "maxRetries": 3
}

```

**Response:**
```json
{
  "id": "uuid",
  "serviceName": "helpdesk",
  "webhookUrl": "https://speakasap.com/helpdesk/api/email/webhook/",
  "status": "active",
  "maxRetries": 3,
  "createdAt": "2026-01-07T12:00:00.000Z"
}
```

## Формат webhook payload

Когда приходит новое письмо, Notifications Microservice отправляет POST запрос на зарегистрированный webhook URL со следующим форматом:

```json
{
  "event": "email.received",
  "timestamp": "2026-01-07T12:00:00.000Z",
  "data": {
    "id": "uuid-email-id",
    "from": "sender@example.com",
    "to": "recipient@speakasap.com",
    "subject": "Email subject",
    "bodyText": "Plain text body of the email",
    "bodyHtml": "<html><body>HTML body of the email</body></html>",
    "attachments": [
      {
        "filename": "document.pdf",
        "contentType": "application/pdf",
        "size": 12345,
        "content": "base64-encoded-content..."
      }
    ],
    "receivedAt": "2026-01-07T12:00:00.000Z",
    "messageId": "ses-message-id-12345"
  }
}
```

## Фильтры

Подписки могут использовать фильтры для получения только определенных писем:

- `to`: массив email адресов получателей (письма должны быть адресованы одному из них). Поддерживается wildcard `*@domain.com`. Заголовок To в формате «Name &lt;<addr@domain.com>&gt;» нормализуется до <addr@domain.com> при сопоставлении.
- `from`: массив email адресов отправителей (письма должны быть от одного из них)
- `subjectPattern`: регулярное выражение для фильтрации по теме письма

## Управление подписками

### GET /webhooks/subscriptions

### GET /webhooks/subscriptions/:id

Получить подписку по ID

### PUT /webhooks/subscriptions/:id

### DELETE /webhooks/subscriptions/:id

Удалить подписку

### POST /webhooks/subscriptions/:id/activate

### POST /webhooks/subscriptions/:id/suspend

Приостановить подписку

## Retry механизм

<contact@speakasap.com>
Если webhook не отвечает или возвращает ошибку:

1. Подписка автоматически повторяет отправку до `maxRetries` раз
2. После превышения лимита подписка автоматически приостанавливается (`suspended`)
3. Статистика сохраняется: `totalDeliveries`, `totalFailures`, `lastError`

## Пример регистрации подписки для Helpdesk

Чтобы письма на **<contact@speakasap.com>** попадали в Helpdesk, в фильтр `to` нужно включить этот адрес или использовать wildcard `*@speakasap.com`:

```bash
curl -X POST https://notifications.statex.cz/webhooks/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "helpdesk",
    "webhookUrl": "https://speakasap.com/helpdesk/api/email/webhook/",
    "filters": {
      "to": ["support@speakasap.com", "help@speakasap.com", "contact@speakasap.com"]
    },
    "maxRetries": 3
  }'
```

Либо один wildcard для всех адресов домена:

```json
"filters": { "to": ["*@speakasap.com"] }
```

## Обработка webhook в вашем сервисе

Ваш сервис должен:

1. Принимать POST запросы на указанный webhook URL
2. Проверять `event === "email.received"`
3. Обрабатывать данные из поля `data`
4. Возвращать HTTP 200 OK для успешной обработки
5. Возвращать HTTP 4xx/5xx для ошибок (будет повторная попытка)

**Пример обработчика (Django):**

```python
@csrf_exempt
def email_webhook(request):
    payload = json.loads(request.body)
    if payload.get('event') == 'email.received':
        email_data = payload.get('data', {})
        # Обработать письмо
        process_email(email_data)
        return HttpResponse('OK')
    return HttpResponse('Unknown event', status=400)
```
