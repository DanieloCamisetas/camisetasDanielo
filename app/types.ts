export type OrderItem = {
  id: string;
  images: string[]; // 1..n imágenes del producto (URL o data-URL)
  sizes: string[]; // 1..n tallas para el mismo artículo
  name: string;
  dorsal: string;
  patches: string[]; // 0..n parches (URL o data-URL)
  note: string; // texto opcional en la columna de detalle
  price: string; // precio (texto libre: "12", "12€", etc.)
};

export type ExtraRow = {
  id: string;
  text: string;
  image: string; // URL o data-URL (opcional)
};

export type PatchOption = {
  src: string; // ruta en /public
  label: string;
};

export type Customer = {
  name: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
};

export const emptyItem = (id: string): OrderItem => ({
  id,
  images: [""],
  sizes: [""],
  name: "",
  dorsal: "",
  patches: [""],
  note: "",
  price: "",
});

export const emptyCustomer: Customer = {
  name: "",
  phone: "",
  country: "",
  province: "",
  city: "",
  address: "",
  postalCode: "",
};
