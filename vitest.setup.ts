if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    })
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    class ResizeObserverStub {
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: ResizeObserverStub,
    })
}
