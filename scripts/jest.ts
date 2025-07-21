// node 'node_modules/.bin/jest' './pages/index.test.ts' --collectCoverageFrom='./pages/index.tsx' --coverage

// TODO: это

export function utx() { return `${Date.now().toString(16)}${Math.floor(Math.random() * 10000).toString(16)}` }

export function setJestMock<T = object>(useStore: object, mockCreator: () => T): T & { clearAllMocks: () => void } {
	const useStoreMock = (useStore as unknown as jest.Mock)
	const mock = {
		...mockCreator(),
		clearAllMocks: () => {
			const mockNext = mockCreator()
			for (const key in mockNext) {
				// @ts-expect-error что то не знаю как это расписать в ts
				mock[key] = mockNext[key]
			}
		},
	}
	useStoreMock.mockReturnValue(mock)
	return mock
}

