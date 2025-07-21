import { exec as nodeExec } from 'node:child_process'

const __dirname = import.meta.dirname
// const __filename = import.meta.filename;

const clearLastLine = () => { process.stdout.moveCursor(0, -1); process.stdout.clearLine(1) }

function consoleStyle({
	bold, yellow, dim,
} = {}) {
	console.log('\x1b[0m'); clearLastLine()

	if (dim) {console.log('\x1b[2m'); clearLastLine() }
	if (bold) {console.log('\x1b[1m'); clearLastLine() }
	if (yellow) {console.log('\x1b[33m'); clearLastLine()}
}

async function exec(command) {
	console.log(command)

	return new Promise((resolve/*, reject*/) => {
		nodeExec(command, {}, (code, stdout/*, , stderr*/) => {
			console.log()
			resolve(stdout)
		})
	})
}

async function go() {
	const argv = process.argv
	let argvTarget = argv.filter((a, i) => i > 1)

	if (argvTarget[0] == 'aa') argvTarget = argvTarget.filter((a, i) => i > 0)

	let push = false
	let force = false
	let noVerify = false

	if (argvTarget[0] == 'f') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		force = true
	}

	if (argvTarget[0] == 'p') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		push = true

		if (argvTarget[0] == 'f') {
			argvTarget = argvTarget.filter((a, i) => i > 0)
			force = true
		}
	}

	if (argvTarget[0] == 'pf') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		push = true
		force = true
	}

	if (argvTarget[0] == 'nv') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		noVerify = true
	}

	if (argvTarget[0] == 'pnv') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		push = true
		noVerify = true
	}

	if (argvTarget[0] == 'pfnv') {
		argvTarget = argvTarget.filter((a, i) => i > 0)
		push = true
		force = true
		noVerify = true
	}

	const comment = argvTarget.join(' ').trim()

	exec(`cd ${__dirname}`)
	exec('cd \'..\'')

	consoleStyle({ dim: true })

	let branch = await exec('git branch --show-current')
	branch = branch.trim()

	if (comment) {
		await exec('git add --all')
		if (await exec('git diff HEAD  --name-only')) {
			let branchNumber = branch
			if (branchNumber.startsWith('release/'))
				branchNumber = branchNumber.replace('release/', '')

			if (branchNumber.startsWith('hotfix/'))
				branchNumber = branchNumber.replace('hotfix/', '')

			await exec(`git commit -m '[${branchNumber}] ${comment}' ${noVerify ? ' --no-verify' : ''}`)

			if (push) await exec(`git push${force ? ' --force' : ''} -u origin ` + branch)
		}
	}

	process.exit()
}

go()
