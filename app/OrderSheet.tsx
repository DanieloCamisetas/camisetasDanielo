import { forwardRef } from 'react';
import type { Customer, ExtraRow, OrderItem } from './types';

type Props = {
  items: OrderItem[];
  extras: ExtraRow[];
  customer: Customer;
};

/**
 * La hoja de pedido tal cual la recibe el proveedor.
 * Estilada solo con hex planos (globals.css) para que html-to-image
 * la capture idéntica a lo que se ve en pantalla.
 */
const OrderSheet = forwardRef<HTMLDivElement, Props>(function OrderSheet(
  { items, extras, customer },
  ref,
) {
  const hasCustomer =
    customer.name ||
    customer.phone ||
    customer.country ||
    customer.province ||
    customer.city ||
    customer.address ||
    customer.postalCode;

  return (
    <div className="sheet" ref={ref}>
      <table>
        <colgroup>
          <col className="c-img" />
          <col className="c-size" />
          <col className="c-name" />
          <col className="c-dorsal" />
          <col className="c-patch" />
          <col className="c-price" />
        </colgroup>
        <thead>
          <tr className="head-row">
            <td>Camiseta</td>
            <td>Talla</td>
            <td>Nombre</td>
            <td>Número</td>
            <td>Parche</td>
            <td>Precio</td>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="img-stack">
                  {item.images.some((src) => src.trim() !== '') ? (
                    item.images
                      .filter((src) => src.trim() !== '')
                      .map((src, i) => (
                        <div className="cell-media" key={i}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" crossOrigin="anonymous" />
                        </div>
                      ))
                  ) : (
                    <div className="cell-media">
                      <span className="empty-hint">—</span>
                    </div>
                  )}
                </div>
              </td>
              <td>
                <div className="size-stack">
                  {item.sizes
                    .filter((s) => s.trim() !== '')
                    .map((s, i) => (
                      <span key={i}>{s}</span>
                    ))}
                </div>
              </td>
              <td>{item.name}</td>
              <td>{item.dorsal}</td>
              <td>
                <div className="patch-stack">
                  {item.patches
                    .filter((p) => p.trim() !== '')
                    .map((p, i) => (
                      <div className="cell-media" key={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" crossOrigin="anonymous" />
                      </div>
                    ))}
                  {item.note ? (
                    <span className="patch-note">{item.note}</span>
                  ) : null}
                </div>
              </td>
              <td className="price-cell">{item.price}</td>
            </tr>
          ))}

          {extras.map((extra) => (
            <tr key={extra.id} className="row-extra">
              <td colSpan={6}>
                <div className="extra-stack">
                  {extra.image ? (
                    <div className="extra-media">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extra.image} alt="" crossOrigin="anonymous" />
                    </div>
                  ) : null}
                  {extra.text ? <span>{extra.text}</span> : null}
                </div>
              </td>
            </tr>
          ))}

          {hasCustomer ? (
            <tr className="customer">
              <td colSpan={6}>
                <div className="customer-block">
                  {customer.name ? (
                    <div>
                      <b>Nombre:</b> {customer.name}
                    </div>
                  ) : null}
                  {customer.phone ? (
                    <div>
                      <b>Teléfono:</b> {customer.phone}
                    </div>
                  ) : null}
                  {customer.country ? (
                    <div>
                      <b>Nación:</b> {customer.country}
                    </div>
                  ) : null}
                  {customer.province ? (
                    <div>
                      <b>Provincia:</b> {customer.province}
                    </div>
                  ) : null}
                  {customer.city ? (
                    <div>
                      <b>Municipio:</b> {customer.city}
                    </div>
                  ) : null}
                  {customer.address ? (
                    <div>
                      <b>DIRECCIÓN:</b> {customer.address}
                    </div>
                  ) : null}
                  {customer.postalCode ? (
                    <div>
                      <b>Código Postal:</b> {customer.postalCode}
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
});

export default OrderSheet;
