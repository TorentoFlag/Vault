"use client";

import Link from "next/link";
import { Container } from "@/components/ui/UI";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="global-state-page">
      <Container>
        <section className="global-state-card">
          <span>Не удалось открыть раздел</span>
          <h1>Произошла ошибка</h1>
          <p>Повторите загрузку. Корзина и данные локального аккаунта останутся в браузере.</p>
          <div><button className="global-state-primary" type="button" onClick={reset}>Попробовать снова</button><Link href="/catalog">В каталог</Link></div>
        </section>
      </Container>
    </main>
  );
}
