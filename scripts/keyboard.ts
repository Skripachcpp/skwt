import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const enum KEYBOARD_CODE {
	ESCAPE = 'Escape',
	ARROW_DOWN = 'ArrowDown',
	ARROW_UP = 'ArrowUp',
	KEY_X = 'KeyX',
	ENTER = 'Enter',
	SPACE = 'Space',
	ARROW_LEFT = 'ArrowLeft',
	ARROW_RIGHT = 'ArrowRight',
	BACKSPACE = 'Backspace',
	TAB = 'Tab',
}

export const enum MODIFIER_CODE {
	SHIFT = 'shiftKey',
	CTRL = 'ctrlKey',
	ALT = 'altKey',
	META = 'metaKey',
}

export function exact(event: KeyboardEvent, target: KEYBOARD_CODE, modifier: MODIFIER_CODE[] | MODIFIER_CODE = []) {
	if (!Array.isArray(modifier))
		modifier = [modifier]

	// проверяем что не нажато лишнего
	if (event.shiftKey && !modifier.includes(MODIFIER_CODE.SHIFT)) return false
	if (event.ctrlKey && !modifier.includes(MODIFIER_CODE.CTRL)) return false
	if (event.altKey && !modifier.includes(MODIFIER_CODE.ALT)) return false
	if (event.metaKey && !modifier.includes(MODIFIER_CODE.META)) return false

	// проверяем что все что надо нажато
	for (const m of modifier) {
		if (m === MODIFIER_CODE.SHIFT && !event.shiftKey) return false
		if (m === MODIFIER_CODE.CTRL && !event.ctrlKey) return false
		if (m === MODIFIER_CODE.ALT && !event.altKey) return false
		if (m === MODIFIER_CODE.META && !event.metaKey) return false
	}

	if (event.code == target) {
		return true
	}

	return false
}

export type KeyboardAction = (event: KeyboardEvent) => unknown | Promise<unknown>

export type Listener = {
	id: string

	keyUp?: KeyboardAction
	keyDown?: KeyboardAction

	order?: number
	last?: number
	time: number

	disable?: boolean

	// для disable without
	// если without совпадет с togetherId
	// то эти хотке как же не будут
	// отключены
	togetherId?: string
}

export const useKeyboardStore = defineStore('keyboard', () => {
	const listeners = ref<Listener[]>([])

	function sort(array: Listener[]) {
		array.sort((a, b) => {
			if (a.order == null && b.order == null) return b.time - a.time
			if (a.order != null && b.order == null) return -1
			if (a.order == null && b.order != null) return 1
			if (a.order == b.order) return b.time - a.time
			if (a.order != null && b.order != null) return a.order - b.order
			if (a.last == null && b.last != null) return -1
			if (a.last != null && b.last == null) return 1
			if (a.last == b.last) return b.time - a.time
			if (a.last != null && b.last != null) return a.last - b.last

			return b.time - a.time
		})

		return array
	}

	function uuidv4() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
			.replace(/[xy]/g, function (c) {
				const r = Math.random() * 16 | 0,
					v = c == 'x' ? r : (r & 0x3 | 0x8)
				return v.toString(16)
			})
	}

	// если не указан order и last или они одинаковые то
	// последний добавленный хоткей выполняется первым
	const addListeners = ({ order, last, keyUp, keyDown, togetherId }: {
		order?: number
		last?: number
		keyUp?: KeyboardAction
		keyDown?: KeyboardAction
		togetherId?: string // для disable without, если id с ним совпадают то этот не отключится тоже
	} = {}): string => {
		const id = uuidv4()
		if (keyUp || keyDown) {
			listeners.value.push({
				order,
				last,
				keyUp,
				keyDown,
				id,
				time: (new Date()).getTime(),
				togetherId,
			})
		}

		return id
	}

	const disable = ({ without }: { without?: string | null } = {}) => {
		listeners.value = listeners.value.map((a) => ({
			...a,
			disable: a.id != without && a.togetherId != without,
		}))
	}

	const enable = () => { listeners.value = listeners.value.map((a) => ({
		...a,
		disable: false,
	})) }

	const removeListeners = (id: string | null | undefined): void => {
		if (id == null) return

		const index = listeners.value?.findIndex((a) => a.id == id)
		if (index < 0) return
		const element = listeners.value?.[index]

		listeners.value?.splice(index, 1)

		// если удалил последний активный элемент, то
		if (index == -1 || !element.disable) {
			if (listeners.value.every((a) => a.togetherId == id || a.disable)) {
				// включить всех остальных подписчиков
				enable()
			}
		}
	}

	const listenersKeyUp = computed<KeyboardAction[]>(() => {
		const l = sort(listeners.value.filter((a) => a.keyUp && !a.disable))
		return l.map((a) => a.keyUp as KeyboardAction)
	})

	const listenersKeyDown = computed<KeyboardAction[]>(() => {
		const l = sort(listeners.value.filter((a) => a.keyDown && !a.disable))
		return l.map((a) => a.keyDown as KeyboardAction)
	})

	const init = () => {
		async function process(actions: KeyboardAction[], event: KeyboardEvent): Promise<boolean> {
			for (const action of actions) {
				// если хоткей обработан то не пытаться обработать его как то еще
				const actionResult = await action?.(event)
				if (actionResult === true) {
					event.stopPropagation()
					event.preventDefault()
					return true
				}
			}

			return false
		}

		let disableKeyUp: boolean | null = null
		document.addEventListener('keyup', async (event: KeyboardEvent) => {
			if (disableKeyUp) return
			await process(listenersKeyUp.value, event)
		})

		document.addEventListener('keydown', async (event: KeyboardEvent) => {
			disableKeyUp = false
			if ((await process(listenersKeyDown.value, event)) === true) {
				disableKeyUp = true
			}
		})
	}

	init()

	return {
		addListeners,
		disable,
		enable,
		removeListeners,
	}
})
