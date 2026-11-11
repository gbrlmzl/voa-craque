import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { FakeEventSource } from "../helpers/fake-event-source";
import { resetNavigation } from "../helpers/next-navigation";

jest.mock("next/navigation", () => require("../helpers/next-navigation"));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
  class FakeIntersectionObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
    takeRecords = () => [];
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: FakeIntersectionObserver });
  Object.defineProperty(window, "EventSource", { writable: true, value: FakeEventSource });
  Object.defineProperty(global, "EventSource", { writable: true, value: FakeEventSource });
  window.URL.createObjectURL = jest.fn(() => "blob:teste");
  window.URL.revokeObjectURL = jest.fn();
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

beforeAll(() => {
  // O jsdom nao navega; sem isto cada clique em link imprime "Not implemented: navigation".
  document.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("a")) event.preventDefault();
  });
});

beforeEach(() => {
  resetNavigation();
  FakeEventSource.reset();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
