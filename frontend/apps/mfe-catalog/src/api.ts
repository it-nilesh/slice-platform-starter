export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

// Relative URL: always same-origin through the gateway, so no CORS is needed.
const BASE_URL = '/api/catalog';

export async function getProducts(signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(`${BASE_URL}/products`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Catalog API responded ${res.status}`);
  return (await res.json()) as Product[];
}
