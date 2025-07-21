// import { exec as nodeExec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import chalk from 'chalk'
import logTree from 'console-log-tree'

const __dirname = path.dirname(import.meta.dirname)

// color -----------------------------------

function stringToColor(str) {
	// Создаем хеш из строки
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash)
	}

	// Преобразуем хеш в цвет
	let color = '#'
	for (let i = 0; i < 3; i++) {
		const value = (hash >> (i * 8)) & 0xff
		color += ('00' + value.toString(16)).slice(-2)
	}

	return chalk.hex(color)
}

function logColoredText(text) {
	const color = stringToColor(text)
	console.log(color(text))
}

// regex -----------------------------------

function escapeRegex(string) {
	// eslint-disable-next-line
	return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// files ---------------------------------

const readFileAsync = promisify(fs.readFile)
const writeFileAsync = promisify(fs.writeFile)

function findFiles(dirPath, ignorePaths, _arrayOfFiles) {
	let files = fs.readdirSync(dirPath)
	_arrayOfFiles = _arrayOfFiles || []

	files.forEach(function (file) {
		if (ignorePaths) {
			for (let ignorePath of ignorePaths) {
				if (file.includes(ignorePath)) {
					return
				}
			}
		}

		if (fs.statSync(dirPath + '/' + file).isDirectory()) {
			_arrayOfFiles = findFiles(dirPath + '/' + file, ignorePaths, _arrayOfFiles)
		} else {
			_arrayOfFiles.push(path.resolve(dirPath, file))
		}
	})

	return _arrayOfFiles
}

// do it ---------------------------------

function processFlags(objFlags = {}) {
	let argv = process.argv.filter((a, i) => i > 1)
	let flags = Object.keys(objFlags)

	let anontArgv = []

	let atherSkip = false
	for (let arg of argv) {
		if (!atherSkip && flags.includes(arg)) {
			objFlags[arg] = true
		} else {
			atherSkip = true
			anontArgv.push(arg)
		}
	}

	return anontArgv
}

async function readComponents(pth) {
	let filesAll = findFiles(pth)
	let filesTsx = filesAll.filter((a) => a.includes('.tsx'))

	let tsx = {}

	// читаем файлы
	let readTasks = []
	for (let path of filesTsx) {
		tsx[path] = { path }
		readTasks.push(readFileAsync(path).then((a) => {
			tsx[path].content = a.toString()
		}))
	}
	await Promise.all(readTasks)

	return tsx
}

async function initImports(tsx) {
	let readTasks = []

	// собираем импорты на файлы в проекте
	let rxImports = 'import(.*)from [\', "](.*)[\', "]'
	for (let tsxPath in tsx) {
		let content = tsx[tsxPath].content
		let importsMatched = content.match(new RegExp(rxImports, 'g'))

		// пропускаем tsx где нет import-ов
		if (!importsMatched) continue

		for (let importMatched of importsMatched) {
			let imps = importMatched.match(new RegExp(rxImports))
			let importPathRelative = imps[2].trim()

			let importPath = importPathRelative
			let importPathArray = importPath?.split('/')
			if (importPathArray?.[0] == '~') {
				// собираем импорты только компонентов
				if (importPathArray?.[1] != 'components') continue

				importPath = importPathArray?.slice(1).join('/')
				importPath = path.resolve(__dirname, importPath)
			} else if (importPath?.[0] == '.') {
				// автоматом резолвит ./ ../ ../..
				importPath = path.resolve(path.dirname(tsxPath), importPath)
			} else {
				// импорт который начинается не с ~ и не с .
				// это не похоже на импорт компонента
				continue
			}

			let imp = {
				importLine: imps[0],
				importPathRelative,
				importPath,
			}

			if (fs.existsSync(imp.importPath + '.tsx')) {
				imp.importPath = imp.importPath + '.tsx'
			} else if (fs.existsSync(imp.importPath + '.ts')) {
				imp.importPath = imp.importPath + '.ts'
			}

			// если файл существует
			if (fs.existsSync(imp.importPath)) {
				readTasks.push(readFileAsync(imp.importPath).then((a) => imp.importContent = a.toString()))
				if (!tsx[tsxPath].imports) tsx[tsxPath].imports = []
				tsx[tsxPath].imports.push(imp)

				// console.log('+', imp.importPath)
			} else {
				// console.log('-', imp.importPath)
			}

			// TODO: заглушка
			tsx[tsxPath].content = null
		}
	}

	await Promise.all(readTasks)

	// удаляем из списка файлы без импорта
	for (let tsxPath in tsx) {
		if (!tsx[tsxPath].imports) {
			delete tsx[tsxPath]
		}
	}
}

async function go() {
	let args = {
		tree: false,
		paths: false,
		validate: false,
		nofix: false,
		help: false,
	}
	processFlags(args)

	if (args.help) {
		console.log('все компоненты могут ссылаться только:')
		console.log('1. на уровне своей папки в своей директории')
		console.log('2. в своей директории на уровни ниже')
		console.log('3. на компоненты в components на уровень 0')
		console.log()
		console.log('все на кого ссылаются pages должны лежать в корневой папке components')
		console.log()
		console.log('если ктото лежит в корневой папке components')
		console.log('и импортируют только из одной подпапки')
		console.log('то его надо положить в папку к компоненту который его импортирует')
		console.log()
		console.log('можно посмотреть дерево зависимостей флагом tree')
		console.log('если после флага tree написать имя компонента то будет поиск по компоненту')
		console.log('если вмето tree написать paths то вместо имен будут пути')

		return
	}

	// если надо поискать зависимости для какого то компонента
	let findComponentInTree = null

	// включаем вместе и там и там показывает дерево
	// только вместо названий компонентов показать где лежит файл
	if (args.paths) args.tree = true

	if (args.validate == false && args.nofix == false && args.tree) {
		const argv = process.argv
		let argvTarget = argv.filter((a, i) => i > 1)
		findComponentInTree = argvTarget.splice(1).join(' ')
		// if (argvTarget[0] == 'aa') argvTarget = argvTarget.filter((a, i) => i > 0)
	}

	// console.log('DEBUG find', findComponentInTree)

	// ищем файлы
	let anyChanges = false

	let rootTsx = await readComponents('./pages')
	let layoutsTsx = await readComponents('./layouts')
	let tsx = await readComponents('./components')

	for (let layoutPath in layoutsTsx) {
		let layoutsElement = layoutsTsx[layoutPath]
		rootTsx[layoutPath] = layoutsElement
	}

	Promise.all([
		initImports(rootTsx),
		initImports(tsx),
	])

	function initChildren(tsxElement, level = 0) {
		// на всякий случай контролируем глубину
		if (level > 100) return

		if (tsxElement == null) return

		// собираем с каких уровней ссылаются на этот элемент
		if (tsxElement.parentLevels == null) tsxElement.parentLevels = []
		if (!tsxElement.parentLevels.includes(level)) tsxElement.parentLevels.push(level)

		if (tsxElement.parentMinLevel == null) {
			tsxElement.parentMinLevel = level
		} else {
			if (tsxElement.parentMinLevel >= level) {
				tsxElement.parentMinLevel = level
			}
		}

		for (let imp of (tsxElement.imports || [])) {
			let { importPath } = imp
			// ищем в списке компонентов зависимость
			let impCmp = tsx[importPath]
			if (impCmp == null) impCmp = tsx[importPath + '/index.tsx']

			if (impCmp) {
				if (!tsxElement.children)
					tsxElement.children = []

				tsxElement.children.push(impCmp)
				if (impCmp.imports) {
					initChildren(impCmp, level + 1)
				}
			}
		}

		// 1 файл может быть импортирован 2 раза как зависимость и как типы
		let alreadyMet = {}
		tsxElement.children = tsxElement.children?.filter((it) => {
			if (alreadyMet[it.path]) return false
			return alreadyMet[it.path] = true
		})

	}

	function initParents(tsxElement, level = 0) {
		// на всякий случай контролируем глубину
		if (level > 100) return
		if (tsxElement == null) return

		for (let children of (tsxElement.children || [])) {
			if (children.parents == null) children.parents = []
			children.parents.push(tsxElement)
			initParents(children, level + 1)
		}
	}

	// строим дерево
	for (let rootPath in rootTsx) {
		let rootElement = rootTsx[rootPath]
		rootElement.root = true
		initChildren(rootElement)
		initParents(rootElement)
	}

	// и так у нас есть двунаправленное дерево
	// кто от кого зависит и
	// кто зависит от этого компонента

	// разворачиваем дерево

	// и так у нас тут будут лежать компоненты которые ни на кого не ссылаются
	let reverseTree = {}
	function initReverseTree(tsxElement, level = 0) {
		// на всякий случай контролируем глубину
		if (level > 100) return
		if (tsxElement == null) return

		for (let children of (tsxElement.children || [])) {
			initReverseTree(children, level + 1)
		}

		if (!tsxElement.children?.length) {
			reverseTree[tsxElement.path] = tsxElement
		}
	}

	for (let rootPath in rootTsx) {
		let rootElement = rootTsx[rootPath]
		initReverseTree(rootElement)
	}

	// console.log('DEBUG reverseTree', reverseTree)

	function pathToComponentName(path) {
		let name = path

		let relativePathArray = path?.split('/')
		if (relativePathArray[relativePathArray.length - 1] == 'index.tsx') {
			name = relativePathArray[relativePathArray.length - 2]
		} else {
			name = relativePathArray[relativePathArray.length - 1]
		}

		if (name == 'pages') {
			name = 'index.tsx'
		}

		return name
	}

	// рисуем дерево с самых маленьких компонентов
	let tree = []

	function childrenTree(tsxElement, level = 0) {
		if (tsxElement == null) return null

		// на всякий случай контролируем глубину
		if (level > 4) return null

		let children = []

		for (let chd of (tsxElement.children || [])) {
			let name = pathToComponentName(chd.path)
			// иногда нужны не названия а пути до компонентов
			if (args.paths) {
				name = chd.path.replace(__dirname + '/', '').replace('/index.tsx', '')
			}
			// name = `[${chd.parents?.length || 0}] ${name}`

			children.push({
				// name: chd.path,
				name,
				children: childrenTree(chd, level + 1),
			})
		}

		return children
	}

	for (let path in rootTsx) {
		let element = rootTsx[path]

		let relativePath = path.replace(__dirname, '')

		let name = pathToComponentName(relativePath)
		// if (element.parents?.length) {
		// 	name = `[${element.parents?.length || 0}] ${name}`
		// }
		tree.push({
			name,
			children: childrenTree(element),
		})
	}

	function initChildrenCount(element) {
		let count = 0
		if (element == null) return count

		count = element.children?.length || 0

		for (let children of (element.children || [])) {
			count = count + initChildrenCount(children) || 0
		}

		element.childrenCount = count
		return count
	}

	for (let element of tree) {
		initChildrenCount(element)
	}

	tree = tree.sort((a, b) => a.childrenCount - b.childrenCount)

	function sortChildren(element) {
		if (element == null) return
		if (!element.children?.length) return

		element.children = element.children.sort(((a, b) => a.childrenCount - b.childrenCount))

		for (let children of (element.children || [])) {
			sortChildren(children) || 0
		}
	}

	for (let element of tree) {
		sortChildren(element)
	}

	function findCmpChildren(it) {
		if (it == null || it.children == null) return []

		let nextCld = []
		for (let cld of it.children) {
			let children = findCmpChildren(cld)

			if (cld.name == findComponentInTree || children?.length) {
				nextCld.push({ name: cld.name, children })
			}
		}

		return nextCld
	}

	if (findComponentInTree) {
		let nextTree = []

		for (let it of tree) {
			let children = findCmpChildren(it)
			if (it.name == findComponentInTree || children?.length) {
				nextTree.push({ ...it, children })
			}
		}

		tree = nextTree
	}

	// полное дерево зависимостей
	if (args.tree) {
		const treeStr = logTree.parse(tree)
		let treeStrArray = treeStr.split('\n')
		for (let str of treeStrArray) {
			let strArray = str.split('─ ')

			const color = stringToColor(strArray[strArray.length - 1])
			console.log(strArray[0], color(strArray[strArray.length - 1]))
		}
	}

	// во первых поищем компоненты которые не используются
	let allPathsUsed = {}

	function initAllPaths(tsxElement) {
		if (tsxElement == null) return

		allPathsUsed[tsxElement.path] = true

		for (let children of (tsxElement.children || [])) {
			if (!children) continue

			allPathsUsed[children.path] = true
			initAllPaths(children)
		}
	}

	for (let rootPath in rootTsx) {
		let rootElement = rootTsx[rootPath]
		initAllPaths(rootElement)
	}

	console.log()
	for (let path in tsx) {
		if (!allPathsUsed[path]) {
			let color0 = chalk.hex('#CD5C5C')
			let color1 = chalk.hex('#FF2400')
			console.log(color0('not used'), color1([path.replace(__dirname + '/', '')].join(' ')))
			anyChanges = true
		}
	}
	console.log()

	// начинаем писать ошибки если что то где то не там лежит
	function checkPaths(componentElement) {
		if (!componentElement?.parents?.length) return

		let componentParents = new Set()
		for (let parentElement of (componentElement.parents || [])) {
			let relativePath = parentElement.path.replace(__dirname + '/', '')

			// все что не в компонентах нас сейчас мало волнует
			if (!relativePath.startsWith('components/')) continue

			componentParents.add(relativePath)
		}
		componentParents = [...componentParents].map((a) => a.split('/').filter((a) => a != 'index.tsx'))

		let componentPath = componentElement.path.replace(__dirname + '/', '').split('/')
		componentPath = componentPath.filter((a) => a != 'index.tsx')

		// комопненты которые лежат в components надо проверить только на то что их может надо положить пониже
		if (componentPath.length <= 2) {
			// если на него не ссылается pages
			// console.log('DEBUG 11', !componentElement.parents.some((parentElement) => !parentElement.path.replace(__dirname + '/', '').startsWith('components/')), componentElement.path)
			if (!componentElement.parents.some((parentElement) => !parentElement.path.replace(__dirname + '/', '').startsWith('components/'))) {
				// то можно проверять можно ли положить его пониже
				let componentElementRelativePath = componentElement.path.replace(__dirname + '/', '')

				let relativePaths = []
				for (let parentElement of (componentElement.parents || [])) {
					let relativePath = path.dirname(parentElement.path.replace(__dirname + '/', '')).split('/')
					relativePaths.push(relativePath)
				}

				let canMove = true
				let relativePath = relativePaths?.[0]
				for (let index in (relativePath || [])) {
					let part = relativePath[index]

					if (relativePaths.some((p) => {
						if (p[index] != part) {
							return true
						}

						return false
					})) {
						canMove = false
						break
					}
				}

				if (canMove) {
					let color0 = chalk.hex('#CD5C5C')
					let color1 = chalk.hex('#FF2400')
					console.log(color0('move'), color1(componentElementRelativePath), color0('to'), color1(relativePaths?.[0].join('/')))
					anyChanges = true
				}
			}

			return
		}

		for (let componentParent of componentParents) {
			// если родитель глебже чем компонент
			if (componentParent.length > componentPath.length) {
				let color0 = chalk.hex('#CD5C5C')
				let color1 = chalk.hex('#FF2400')
				console.log(color0('parent'), color1(componentParent.join('/')), color0('deeper than dependence'), color1(componentPath.join('/')))
				anyChanges = true
			} else {
				let folderParent = componentParent.filter((a, i) => i < componentParent.length - 1)
				let folderComponent = componentPath.filter((a, i) => i < componentParent.length - 1)

				if (folderParent.join('/') != folderComponent.join('/')) {
					let color0 = chalk.hex('#CD5C5C')
					let color1 = chalk.hex('#FF2400')
					console.log(color0('parent'), color1(componentParent.join('/')), color0('in different directory than dependency'), color1(componentPath.join('/')))
					anyChanges = true
				}
			}
		}
	}

	for (let componentFullPath in tsx) {
		let componentElement = tsx[componentFullPath]
		checkPaths(componentElement)
	}

	// если pages обращаются к чему то внутри components уровень глубже 0
	for (let componentFullPath in rootTsx) {
		let componentElement = rootTsx[componentFullPath]
		for (let children of (componentElement.children || [])) {
			let relativePath = children.path.replace(__dirname + '/', '').replace('/index.tsx', '')
			let relativePathArray = relativePath?.split('/')
			// ну пусть если это компонент к корневой папке то путь будет так можно
			if (relativePathArray[relativePathArray.length - 1].includes('.tsx')) {
				relativePathArray.pop()
			}

			if (relativePathArray.length > 2) {
				let color0 = chalk.hex('#CD5C5C')
				let color1 = chalk.hex('#FF2400')
				console.log(color0('page'), color1(pathToComponentName(componentFullPath)), color0('can\'t used not root cmp'), color1(relativePath))
			}

		}
		// checkPaths(componentElement)
	}

	let count = 0
	for (let key in tsx) {
		count = count + 1

		// эта строчки нчего не значит
		if (key) {key = key?.toString()}
	}

	let color = chalk.hex('#1CAC78')
	console.log()
	console.log(color('в проекте пока всего', count, 'компонент(ов)'))
	console.log()

	// выйти с ошибкой если были найдены какие то ошибки
	if (anyChanges) {
		console.error('')
		console.error('❌ расположение файлов не соответствует задумке автора проекта ❌')
		console.error('')

		// TODO: надо тех кто не на pages но всем нужен положить в отдельную папку типо shared
		// TODO: и еще проверку написать чтобы небыло импортов типо ../../..
		// TODO: и еще проверку написать чтобы небыло импортов типо ~/components/moderation-page/left-right

		process.exit(1)
	}
}

go()
