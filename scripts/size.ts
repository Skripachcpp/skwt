import { defineStore } from 'pinia'
import { ref } from 'vue'

declare global {
	interface Window {
		chrome: unknown
	}
}

export enum DeviceType {
	other = 'other',
	mobile = 'mobile',
	desktop = 'desktop',
}

export enum DeviceOs {
	other = 'other',
	Mac = 'Mac',
	Windows = 'Windows',
	Android = 'Android',
	iOs = 'iOs',
}

const is = {
	Mac() { return Boolean(navigator.userAgent.match(/Mac/i))},
	Win() { return Boolean(navigator.userAgent.match(/Win/i)) },
	Android() { return Boolean(navigator.userAgent.match(/Android/i)) },
	BlackBerry() { return Boolean(navigator.userAgent.match(/BlackBerry/i)) },
	iOS() { return Boolean(navigator.userAgent.match(/iPhone|iPad|iPod/i)) },
	Opera() { return Boolean(navigator.userAgent.match(/Opera Mini/i)) },
	Chrome() { return Boolean(navigator.userAgent.match(/Chrome/i) && navigator.userAgent.match(/Google Inc/i)) },
	WindowsMobile() { return Boolean(navigator.userAgent.match(/IEMobile/i) || navigator.userAgent.match(/WPDesktop/i)) },
	Mobile() { return (is.Android() || is.BlackBerry() || is.iOS() || is.Opera() || is.WindowsMobile() || navigator.userAgent.match(/ Mobile /i)) },
	HeadlessBrowser() {
		const hasHeadlessInUserAgent = /HeadlessChrome/.test(navigator.userAgent)
		const hasWebDriver = navigator.webdriver
		const hasChrome = window.chrome

		return hasHeadlessInUserAgent || hasWebDriver || !hasChrome
	},
}

function getDeviceType(): DeviceType {
	if (is.Mobile()) return DeviceType.mobile
	if (is.Mac() || is.Win()) return DeviceType.desktop

	return DeviceType.other
}

function getDeviceOs(): DeviceOs {
	if (is.iOS()) return DeviceOs.iOs
	if (is.Mac()) return DeviceOs.Mac
	if (is.Win()) return DeviceOs.Windows
	if (is.Android()) return DeviceOs.Android

	return DeviceOs.other
}

function isBrowserChrome(): boolean { return is.Chrome() }
function isHeadlessBrowser(): boolean { return is.HeadlessBrowser() }

const browserInfo = {
	getDeviceType: getDeviceType,
	getDeviceOs: getDeviceOs,
	isBrowserChrome: isBrowserChrome,
	isHeadlessBrowser: isHeadlessBrowser,
}

// type BrowserInfo = typeof browserInfo

export const useSizeStore = defineStore('size', () => {
	const width = ref<number | null>(null)
	const height = ref<number | null>(null)

	const small = ref<boolean | null>(null)
	const medium = ref<boolean | null>(null)
	const large = ref<boolean | null>(null)

	const mobile = ref<boolean | null>(null)

	const updateDevice = () => {
		const deviceType = browserInfo.getDeviceType()
		if (deviceType === DeviceType.mobile) mobile.value = true
		else mobile.value = false
	}

	updateDevice()
	setInterval(updateDevice, 5 * 1000)

	const updateSize = () => {
		const { innerWidth, innerHeight } = window
		height.value = innerHeight
		width.value = innerWidth

		if (height.value == 0) height.value = null
		if (width.value == 0) width.value = null

		if (width.value != null && width.value <= 540) {
			if (!small.value) small.value = true
		} else {
			if (small.value) small.value = false
		}

		if (width.value != null && width.value <= 699) {
			if (!medium.value) medium.value = true
		} else {
			if (medium.value) medium.value = false
		}

		if (width.value != null && width.value <= 1279) {
			if (!large.value) large.value = true
		} else {
			if (large.value) large.value = false
		}
	}

	updateSize()
	window.addEventListener('resize', () => { updateSize() })

	return {
		width,
		height,

		small,
		medium,
		large,
		mobile,
	}
})
