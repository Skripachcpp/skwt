import { exec as nodeExec } from 'node:child_process'
const __dirname = import.meta.dirname

async function exec(command) {
	console.log(command)

	return new Promise((resolve/*, reject*/) => {
		nodeExec(command, {}, (code, stdout/*, , stderr*/) => {
			console.log()
			resolve(stdout)
		})
	})
}

const consoleClearLastLine = () => {
	process.stdout.moveCursor(0, -1) // up one line
	process.stdout.clearLine(1) // from cursor to end
}

function consoleStyle({
	bold,
	yellow,
	dim,
} = {}) {

	console.log('\x1b[0m')
	consoleClearLastLine()

	if (dim) {console.log('\x1b[2m'); consoleClearLastLine() }
	if (bold) {console.log('\x1b[1m'); consoleClearLastLine() }
	if (yellow) {console.log('\x1b[33m'); consoleClearLastLine()}
}

async function go() {
	let argv = process.argv
	let argvTarget = argv.filter((a, i) => i > 1)

	let release = false

	if (argvTarget[0] == 'r') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		release = true
	}

	let branch = argvTarget.join(' ').trim()

	exec(`cd ${__dirname}`)
	exec('cd \'..\'')

	consoleStyle({ dim: true })

	await exec('git add --all')

	let stash = false
	if (await exec('git diff HEAD  --name-only')) {
		await exec('git stash')
		stash = true
	}

	await exec('git fetch --all')

	let createBranch = true

	if (await exec(`git rev-parse --verify --quiet origin/release/${branch}`)) {
		await exec(`git checkout release/${branch}`)
		await exec('git pull')
		createBranch = false
	}

	if (await exec(`git rev-parse --verify --quiet origin/${branch}`)) {
		await exec(`git checkout ${branch}`)
		await exec('git pull')
		createBranch = false
	}

	if (release) {
		branch = 'release/' + branch
	}

	if (createBranch) {
		await exec('git checkout master')
		await exec('git pull')
		await exec('git branch ' + branch)
		await exec('git checkout ' + branch)
		await exec('git push -u origin ' + branch)
	}

	if (stash) {
		await exec('git stash pop')
		stash = false
	}

	process.exit()
}

go()
