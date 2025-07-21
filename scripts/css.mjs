// import { exec as nodeExec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

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

const IGNORE = ['libraries', 'packages', 'node_modules', '.idea', '.git', '.nuxt', '.o3', '.vscode', '.githooks', '_templates']

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

async function go() {
	let args = {
		validate: false,
		nofix: false,
	}
	processFlags(args)

	// ищем файлы
	let anyChanges = false
	let filesAll = findFiles('./', IGNORE)
	let filesTsx = filesAll.filter((a) => a.includes('.tsx'))

	let tsx = {}

	let readTasks = []

	for (let path of filesTsx) {
		tsx[path] = { path }
		readTasks.push(readFileAsync(path).then((a) => tsx[path].content = a.toString()))
	}

	await Promise.all(readTasks)
	readTasks = []

	// let rxImports1 = `import(.*)from [', "](.*)${escapeRegex('.module.css?module')}`
	let rxImports = `import(.*)from [', "](.*\\.module)${escapeRegex('.css')}`
	for (let tsxPath in tsx) {
		let content = tsx[tsxPath].content
		let imports = content.match(new RegExp(rxImports, 'g'))

		// пропускаем tsx где нет import css
		if (!imports) continue

		for (let item of imports) {
			let imps = item.match(new RegExp(rxImports))

			let importPath = imps[2].trim()
			if (importPath) importPath = importPath + '.css'
			importPath = path.resolve(path.dirname(tsxPath), importPath)

			let imp = {
				importContent: null,
				importName: imps[1].trim(),
				importPath,
			}

			// если файл существует
			if (fs.existsSync(imp.importPath)) {
				readTasks.push(readFileAsync(imp.importPath).then((a) => imp.importContent = a.toString()))
				if (!tsx[tsxPath].imports) tsx[tsxPath].imports = []
				tsx[tsxPath].imports.push(imp)
			} else {
				// console.log('importPath not exist', imp.importPath);
			}
		}
	}

	await Promise.all(readTasks)

	// удаляем из списка файлы без импорта
	for (let tsxPath in tsx) {
		if (!tsx[tsxPath].imports) {
			delete tsx[tsxPath]
		}
	}

	// разворачиваем от tsx к css
	let css = {}
	for (let tsxPath in tsx) {
		let tsxItem = tsx[tsxPath]

		for (let imp of tsxItem.imports) {
			// если в css пусто то и нафиг его
			if (!imp.importContent) continue

			if (!css[imp.importPath]) css[imp.importPath] = {
				content: imp.importContent,
				path: imp.importPath,
				tsxs: [],
			}
			css[imp.importPath].tsxs.push({
				tsxPath: tsxPath,
				tsxContent: tsxItem.content,
				importName: imp.importName,
			})
		}
	}

	// начинаем обработку файлов css и tsx
	let writeFileTasks = []
	let rxClass = '^\\.(.*[\n]?.*){'
	for (let cssPath in css) {
		let cssItem = css[cssPath]

		let classCss = cssItem.content.match(new RegExp(rxClass, 'gm'))?.map((a) => a.match(rxClass)?.[1].trim())

		classCss = classCss?.filter((a) => a)
		if (!classCss?.length) continue

		let textCss = cssItem.content

		// если ни одного класса в css не найдено то едем дальше
		if (!classCss) continue

		// собираем список классов для удаления
		let classCssForDelete = {}
		for (let cCss of classCss) {
			let cTsx = cCss

			// пропускаем сложные классы
			if (['[', ']', '(', ')', '+', '*', '=', '>', '\n'].some((a) => cCss.includes(a))) {
				continue
			}

			// с этими можно поработать
			let complex = ['.', ':', ' ']
			if (complex.some((a) => cCss.includes(a))) {
				cTsx = cCss
				if (cTsx.includes([':']))
					cTsx = cTsx.split(':')?.[0]

				if (cTsx.includes([' .']))
					cTsx = cTsx.split(' .').slice(-1)[0]

				if (cTsx.includes(['.']))
					cTsx = cTsx.split('.')?.[0]

				if (cTsx.includes([' ']))
					cTsx = cTsx.split(' ')[0]

				// не смогли разобрать до конца, пропускаем
				if (complex.some((a) => cTsx.includes(a))) {
					continue
				}
			}

			// собираем список классов на удаление
			let classUsed = false
			for (let tsxItem of cssItem.tsxs) {
				let textTsx = tsxItem.tsxContent
				let importName = tsxItem.importName

				// если есть динамические стили
				if (textTsx.match(new RegExp(escapeRegex(importName + '[')))) {
					classUsed = true
					break
				}

				// и опять же если есть динамические стили
				if (textTsx.match(new RegExp(escapeRegex('...' + importName)))) {
					classUsed = true
					break
				}

				// и опять же если есть что то без точки в конце то считаем что такое мы разобрать не можем
				if (textTsx.match(new RegExp(`.*${importName}(?!\\.).*`, 'gm'))?.filter((a) => !a.includes('import')).length > 0) {
					classUsed = true
					break
				}

				// если класс используется
				if (textTsx.match(new RegExp(`${importName}\\.${cTsx}\\W`))) {
					classUsed = true
					break
				}
			}

			if (!classUsed) {
				classCssForDelete[cCss] = true
			}
		}

		// если нечего удалять то пропускаем перезапись файла
		if (Object.keys(classCssForDelete).length <= 0) {
			continue
		}

		console.log(path.relative(process.cwd(), cssPath), Object.keys(classCssForDelete).length)

		// перезаписываем файл без классов которые не используются
		let linesCss = textCss.split('\n')

		let linesCssNext = []
		let skip = false
		for (let line of linesCss) {
			if (!skip) {
				let c = line.match(/^\.(.*){/)?.[1].trim()
				if (classCssForDelete[c]) {
					skip = true
				}
			}

			if (!skip) {
				linesCssNext.push(line)
			} else {
				// выводим в консоль все что хотим удалить
				if (line) {
					console.log(line)
				}
			}

			if (skip) {
				if (line.match(/}/)) {
					skip = false
				}
			}
		}

		let origTextCss = cssItem.content
		let nextTextCss = linesCssNext.join('\n')

		if (origTextCss != nextTextCss) {
			if (!args.nofix) writeFileTasks.push(writeFileAsync(cssItem.path, nextTextCss))
			anyChanges = true
		}
	}

	await Promise.all(writeFileTasks)

	// выйти с ошибкой если этот код запускался автоматически при коммите
	if (args.validate && anyChanges) {
		console.error('')
		console.error('❌ Были обнаружены неиспользуемые CSS классы, они были удалены ❌')
		console.error('❌ Добавьте новые файлы в commit и повторите                   ❌')
		process.exit(1)
	}
}

go()
