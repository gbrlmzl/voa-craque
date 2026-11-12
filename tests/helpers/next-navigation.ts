// Mock de next/navigation para os testes de componente (ver tests/setup/dom.ts).
export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
};

let pathname = "/";
let search = new URLSearchParams();

export function setLocation(path: string, query = "") {
  pathname = path;
  search = new URLSearchParams(query);
}

export function resetNavigation() {
  for (const fn of Object.values(router)) fn.mockReset();
  pathname = "/";
  search = new URLSearchParams();
}

export const useRouter = () => router;
export const usePathname = () => pathname;
export const useSearchParams = () => search;
export const useParams = () => ({});
export const redirect = (url: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
};
export const notFound = () => {
  throw new Error("NEXT_NOT_FOUND");
};
export const unstable_rethrow = (error: unknown) => {
  throw error;
};
