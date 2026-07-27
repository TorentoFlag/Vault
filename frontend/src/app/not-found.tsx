import Link from "next/link";
import type { Metadata } from "next";

import { Container } from "@/components/ui/UI";

export const metadata: Metadata = {
  title: "Страница не найдена — Vault",
  description: "Запрошенная страница не найдена. Перейдите в каталог цифровых товаров Vault.",
};

export default function GlobalNotFound() {
  return (
    <main id="main-content" className="global-state-page">
      <Container>
        <section className="global-state-card">
          <span>Ошибка 404</span>
          <h1>Такой страницы нет</h1>
          <p>Проверьте адрес или вернитесь в каталог цифровых товаров Vault.</p>
          <div><Link className="global-state-primary" href="/catalog">Открыть каталог</Link><Link href="/">На главную</Link></div>
        </section>
      </Container>
    </main>
  );
}
