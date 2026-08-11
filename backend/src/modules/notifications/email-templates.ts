export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

function emailHtml(content: string): string {
  return `<!doctype html><html lang="ru"><body style="margin:0;background:#f6f7fb;color:#18212f;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:14px"><div style="font-size:24px;font-weight:700;margin-bottom:24px">Vault</div>${content}<p style="margin-top:28px">С уважением,<br><strong>Команда Vault</strong></p></main></body></html>`;
}

export function renderEmailVerificationEmail(input: { code: string; expireMinutes: number }): RenderedEmail {
  const code = escapeHtml(input.code);
  const expireMinutes = Math.max(1, Math.floor(input.expireMinutes));
  return {
    subject: "Подтверждение адреса электронной почты — Vault",
    text: `Здравствуйте!\n\nБлагодарим за регистрацию.\n\nДля подтверждения адреса электронной почты введите код ниже:\n\nКод подтверждения: ${input.code}\n\nКод действителен в течение ${expireMinutes} минут.\n\nЕсли вы не запрашивали подтверждение электронной почты, просто проигнорируйте это письмо. Никому не сообщайте код подтверждения.\n\nС уважением,\nКоманда Vault`,
    html: emailHtml(`<p>Здравствуйте!</p><p>Благодарим за регистрацию.</p><p>Для подтверждения адреса электронной почты введите код ниже:</p><p style="font-size:24px;font-weight:700;letter-spacing:3px;padding:16px;background:#f0f3ff;border-radius:8px">${code}</p><p>Код действителен в течение ${expireMinutes} минут.</p><p>Если вы не запрашивали подтверждение электронной почты, просто проигнорируйте это письмо. Никому не сообщайте код подтверждения.</p>`),
  };
}

export function renderAppleOrderAcceptedEmail(input: { orderId: string; productName: string; amount: string; date: string }): RenderedEmail {
  const productName = escapeHtml(input.productName);
  return {
    subject: `Заказ #${input.orderId} принят — Vault`,
    text: `Здравствуйте!\n\nСпасибо за ваш заказ в Vault.\n\nМы получили вашу заявку и уже приступили к ее обработке. После проверки оплаты код подарочной карты будет отправлен на адрес электронной почты, указанный при оформлении заказа.\n\nИнформация о заказе:\n\nНомер заказа: #${input.orderId}\n\nТовар: ${input.productName}\n\nСумма: ${input.amount}\n\nДата оформления: ${input.date}\n\nЕсли у вас возникнут вопросы по заказу, пожалуйста, свяжитесь с нашей службой поддержки, ответив на это письмо или воспользовавшись контактами, указанными на сайте.\n\nБлагодарим за выбор Vault!\n\nС уважением,\nКоманда Vault`,
    html: emailHtml(`<p>Здравствуйте!</p><p>Спасибо за ваш заказ в Vault.</p><p>Мы получили вашу заявку и уже приступили к ее обработке. После проверки оплаты код подарочной карты будет отправлен на адрес электронной почты, указанный при оформлении заказа.</p><h3>Информация о заказе</h3><p>Номер заказа: <strong>#${escapeHtml(input.orderId)}</strong><br>Товар: ${productName}<br>Сумма: ${escapeHtml(input.amount)}<br>Дата оформления: ${escapeHtml(input.date)}</p><p>Если у вас возникнут вопросы по заказу, пожалуйста, свяжитесь с нашей службой поддержки, ответив на это письмо или воспользовавшись контактами, указанными на сайте.</p><p>Благодарим за выбор Vault!</p>`),
  };
}
