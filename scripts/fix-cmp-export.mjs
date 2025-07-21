import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

// regex -----------------------------------

// function escapeRegex(string) {
// 	// eslint-disable-next-line
// 	return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
// }

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

function camelCase(str) {
	return str
		// разбивает 'my-long-word' на массив ['my', 'long', 'word']
		.split('-')
		// Переводит в верхний регистр первые буквы всех элементом массива
		// превращает ['my', 'long', 'word'] в ['My', 'Long', 'Word']
		.map((word) => word[0].toUpperCase() + word.slice(1))
		// соединяет ['My', 'Long', 'Word'] в 'MyLongWord'
		.join('')
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

function changeImports(tsx, needFixImport) {
	let anyChanges = false

	for (let tsxPath in tsx) {
		let content = tsx[tsxPath].content

		for (let renameImport of needFixImport) {
			// if (renameImport.fileName != 'on-start') continue
			let rxImport = `^import(.*)from '(.*)/${renameImport.fileName}'$`
			let importMatch = content.match(new RegExp(rxImport, 'gm'))?.[0]
			if (!importMatch) continue
			// сложные импорты проще руками поправить
			if (importMatch.includes('{')) {
				continue
			} else {
				tsx[tsxPath].content = content = content.replace(new RegExp(rxImport, 'gm'), `import { ${renameImport.nextName} } from '$2/${renameImport.fileName}'`)
				tsx[tsxPath].anyChanges = true
				anyChanges = true
				console.log('change ', importMatch, ' => ', `import { ${renameImport.nextName} } fro...`)
			}
		}
	}

	return anyChanges
}

async function saveIfChange(tsx) {
	let writeFileTasks = []
	for (let tsxPath in tsx) {
		if (!tsx[tsxPath].anyChanges) continue
		writeFileTasks.push(writeFileAsync(tsxPath, tsx[tsxPath].content))
	}

	await Promise.all(writeFileTasks)
}

async function go() {
	let args = {
		validate: false,
		nofix: false,
	}
	processFlags(args)

	let tsx = await readComponents('./components')

	// ищем файлы
	let anyChanges = false

	let needFixImport = []
	let rxComponent = '(^export(.*)defineComponent\\(\\{.*\n.*name: \')(.*)(\',$)'
	for (let tsxPath in tsx) {
		let content = tsx[tsxPath].content
		let componentText = content.match(new RegExp(rxComponent, 'gm'))?.[0]
		if (!componentText) continue
		let componentMatch = componentText.match(new RegExp(rxComponent))

		let componentName = componentText.match(new RegExp(rxComponent))?.[3]
		let componentExportName = componentMatch?.[2].trim()

		let fileName = path.basename(tsxPath)?.split('.')?.[0]
		let folderName = path.basename(path.dirname(tsxPath))

		if (content.match('// fix-cmp-export add folder name') && fileName != 'index') {
			fileName = folderName + '-' + fileName
		}

		if (fileName == 'index')
			fileName = path.basename(path.dirname(tsxPath))

		let nextComponentName = camelCase(fileName)

		if (componentExportName != 'default') {
			let constName = componentExportName.match('const(.*)=')?.[1]?.trim()
			if (constName) componentExportName = constName
		}

		if (componentName != nextComponentName || componentExportName != nextComponentName) {
			if (componentExportName != nextComponentName) {
				needFixImport.push({
					name: componentName,
					export: componentExportName,
					nextName: nextComponentName,
					fileName,
				})
			}

			content = content.replace(new RegExp(rxComponent, 'gm'), `export const ${nextComponentName} = defineComponent({\n	name: '${nextComponentName}',`)
			anyChanges = true

			if (componentName != nextComponentName) {
				console.log('change name', componentName, ' => ', nextComponentName)
			} else {
				console.log('change export', componentExportName, ' => ', nextComponentName)
			}
		}

		if (anyChanges) {

			tsx[tsxPath].content = content
			tsx[tsxPath].anyChanges = true
		}
	}

	if (changeImports(tsx, needFixImport)) anyChanges = true
	if (!args.nofix) await saveIfChange(tsx)

	let pagesTsx = await readComponents('./pages')
	if (changeImports(pagesTsx, needFixImport)) anyChanges = true
	if (!args.nofix) await saveIfChange(pagesTsx)

	// выйти с ошибкой если этот код запускался автоматически при коммите
	if (args.validate && anyChanges) {
		console.error('')
		console.error('❌ export default был заменен на именованный export ❌')
		process.exit(1)
	}
}

go()
