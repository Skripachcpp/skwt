import axios from 'axios'
import type { CancelTokenSource, CancelToken } from 'axios'

// TODO: это

export function useSingleRequest(): () => CancelToken {
	let source: CancelTokenSource | null = null

	return () => {
		source?.cancel('')
		source = axios.CancelToken.source()

		return source.token
	}
}

export type InfiniteScroll<T> = T & {
	limit?: number
	offset?: number
	cancelToken?: CancelToken
}

export function useInfiniteScroll<TItems, TFilter = undefined>(
	functionFetch: (query: InfiniteScroll<TFilter>) => Promise<TItems[]>,
	options: {
		limit?: number
	} = {},
) {
	let filterLast: TFilter

	let itemsAll: TItems[] = []

	const limit = options?.limit || 100
	let readComplete = false

	let taskFetch: Promise<TItems[]> | null = null
	let taskMore: Promise<TItems[]> | null = null

	const singleRequest = useSingleRequest()

	return {
		get readComplete() {return readComplete},
		get loading() { return !!taskFetch || !!taskMore },
		get items() {return itemsAll},

		fetch: (filter: TFilter) => {
			if (taskFetch && JSON.stringify(filter) == JSON.stringify(filterLast))
				return taskFetch

			readComplete = false
			filterLast = filter

			taskFetch = functionFetch({ ...filterLast, limit, offset: 0, cancelToken: singleRequest() })
				.then((items) => {
					if (items.length < limit)
						readComplete = true

					itemsAll = items

					return itemsAll
				}).finally(() => taskFetch = null)

			return taskFetch
		},
		more: async (): Promise<TItems[]> => {
			if (taskFetch) return taskFetch
			if (taskMore) return taskMore
			if (readComplete) return itemsAll

			if (filterLast == undefined) return itemsAll

			taskMore = functionFetch({ ...filterLast, limit, offset: itemsAll.length, cancelToken: singleRequest() })
				.then((items) => {
					if (items.length < limit) readComplete = true
					itemsAll = itemsAll.concat(items)

					return itemsAll
				}).finally(() => taskMore = null)

			return taskMore
		},
	}
}
