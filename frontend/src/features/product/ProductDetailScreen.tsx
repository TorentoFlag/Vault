import Image from "next/image";
import Link from "next/link";

import { ProductCard } from "@/components/marketplace/ProductCard";
import { Icon } from "@/components/ui/Icon";
import { Breadcrumbs, Container, StatusBadge } from "@/components/ui/UI";
import { publicAssetPath } from "@/config/site";
import { getProductStatusLabel } from "@/lib/catalog";
import { getProductVisualLabel } from "@/lib/product-visual";
import type { Product } from "@/types/commerce";

import { ProductPurchaseAction } from "./ProductPurchaseAction";
import { CatalogReturnLink } from "./CatalogReturnLink";
import styles from "./product.module.css";

function ProductArtwork({ product }: { product: Product }) {
  if (product.image) {
    return (
      <Image
        src={publicAssetPath(product.image)}
        alt={product.imageAlt ?? product.title}
        fill
        priority
        sizes="(max-width: 900px) calc(100vw - 40px), 760px"
      />
    );
  }

  const packageSpecification = product.details.specifications.find((specification) => (
    specification.label === "Зачисление в Steam" || specification.label === "Период"
  ));

  return (
    <div className={`${styles.serviceArtwork} ${styles[product.kind]}`} aria-hidden="true">
      {product.kind === "steam" ? <Icon name="steam" width="72" height="72" /> : null}
      <strong>{getProductVisualLabel(product)}</strong>
      <b>{packageSpecification?.value ?? product.productType}</b>
      <span>{product.details.fulfillment.title}</span>
    </div>
  );
}

export function ProductDetailScreen({
  product,
  relatedProducts,
  catalogReturnHref,
}: {
  product: Product;
  relatedProducts: Product[];
  catalogReturnHref: string;
}) {
  const visibleMeta = product.meta.filter((item) => !/coins|rub/i.test(item));

  return (
    <main id="main-content" className={styles.productPage}>
      <Container>
        <Breadcrumbs
          items={[
            { label: "Главная", href: "/" },
            { label: "Каталог", href: "/catalog" },
            { label: product.category, href: `/catalog?category=${product.kind}` },
            { label: product.title },
          ]}
        />
        <CatalogReturnLink className={styles.catalogReturnLink} />

        <div className={styles.demoDisclosure} role="note">
          <strong>Параметры заказа</strong>
          <span>Стоимость фиксируется в Coins до подтверждения заказа.</span>
        </div>

        <div className={styles.productLayout}>
          <div className={styles.productMainColumn}>
            <section className={styles.mediaPanel} aria-label={`Изображение товара ${product.title}`}>
              <ProductArtwork product={product} />
              <span className={styles.mediaCategory}>{product.category}</span>
            </section>

            <div className={styles.informationGrid}>
              <section className={styles.infoSection}>
                <div className={styles.infoHeading}>
                  <span>01</span>
                  <div><h2>Характеристики</h2><p>Параметры выбранного товара.</p></div>
                </div>
                <dl className={styles.specificationList}>
                  {product.details.specifications.map((specification) => (
                    <div key={specification.label}>
                      <dt>{specification.label}</dt>
                      <dd>{specification.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className={styles.infoSection}>
                <div className={styles.infoHeading}>
                  <span>02</span>
                  <div><h2>Данные заказа</h2><p>Что потребуется сохранить при оформлении.</p></div>
                </div>
                <ul className={styles.requirementList}>
                  {product.details.fulfillment.requirements.map((requirement) => (
                    <li key={requirement}><Icon name="check" width="17" height="17" /><span>{requirement}</span></li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <aside className={styles.purchasePanel} aria-labelledby="product-title">
            <div className={styles.purchaseEyebrow}>
              <span>{product.productType}</span>
            </div>

            <h1 id="product-title">{product.title}</h1>
            <p className={styles.productDescription}>{product.description}</p>

            <div className={styles.metaList} aria-label="Основные характеристики">
              {visibleMeta.map((item) => <span key={item}>{item}</span>)}
            </div>

            <div className={styles.statusRow}>
              <StatusBadge tone={product.availability === "on-request" ? "warning" : "success"}>
                {getProductStatusLabel(product)}
              </StatusBadge>
              <div className={styles.fulfillmentFact}>
                <small>Тип заказа</small>
                <span>{product.details.fulfillment.title}</span>
              </div>
            </div>

            <div className={styles.detailPrice}>
              <span>Стоимость</span>
              <div><strong>{product.priceCoins.toLocaleString("ru-RU")}</strong><b>Coins</b></div>
            </div>

            <ProductPurchaseAction product={product} />

            <div className={styles.receiptSummary}>
              <Icon name="shield" width="19" height="19" />
              <div>
                <strong>Что сохранится в заказе</strong>
                <p>{product.details.fulfillment.description}</p>
              </div>
            </div>

          </aside>
        </div>

        {relatedProducts.length ? (
          <section className={styles.relatedSection} aria-labelledby="related-title">
            <div className={styles.relatedHeading}>
              <div>
                <h2 id="related-title">Похожие товары</h2>
                <p>Другие варианты из категории «{product.category}».</p>
              </div>
              <Link href={`/catalog?category=${product.kind}`}>Все товары категории</Link>
            </div>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} compact returnHref={catalogReturnHref} />
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
