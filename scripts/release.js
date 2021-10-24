const args = require('minimist')(process.argv.slice(2))
const path = require('path')
const execa = require('execa')
const { prompt } = require('enquirer')
const version = require('../package.json').version
const semver = require('semver')
const { dye } = require('@prostojs/dye')
const run = (bin, args, opts = {}) =>
  execa(bin, args, { stdio: 'inherit', ...opts })
const bin = name => path.resolve(__dirname, '../node_modules/.bin/' + name)  

const step = dye('cyan').prefix('\n').attachConsole()
const error = dye('red-bright').attachConsole('error')
const good = dye('green', 'bold').prefix('\n✓').attachConsole()
const info = dye('green', 'dim').attachConsole('info')

const branch = execa.sync('git', ['branch', '--show-current']).stdout
const inc = i => {
    if (['prerelease', 'premajor'].includes(i.split(' ')[0])) {
        const [action, pre] = i.split(' ')
        return semver.inc(version, action, pre)
    } else {
        return semver.inc(version, i)
    }
}

const isDryRun = args.dry
const skipTests = args.skipTests
const skipBuild = args.skipBuild

const commitMessage = execa.sync('git', ['log', '-1', '--pretty=%B']).stdout

const gitStatus = execa.sync('git', ['status']).stdout
if (gitStatus.indexOf('nothing to commit, working tree clean') < 0) {
    error('Please commit all the changes first.')
    process.exit(1)
}

main()

async function main() {
    let targetVersion = version
    if (branch === 'main') {
        // for main proposing typeof version increase
        const versionIncrements = [
            'patch',
            'minor',
            'prerelease alpha',
            'prerelease beta',
            'preminor alpha',
            'preminor beta',
            'premajor alpha',
            'premajor beta',
            'major',
          ]
    
        const { release } = await prompt({
            type: 'select',
            name: 'release',
            message: 'Select release type',
            choices: versionIncrements.map(i => `${i} (${inc(i)})`)
        })
      

        targetVersion = release.match(/\((.*)\)/)[1]

        if (!semver.valid(targetVersion)) {
            throw new Error(`invalid target version: ${targetVersion}`)
        }

        const { yes } = await prompt({
            type: 'confirm',
            name: 'yes',
            message: `Releasing v${targetVersion}. Confirm?`
        })
    
        if (!yes) {
            return
        }

        // run tests before release
        step('Running tests...')
        if (!skipTests && !isDryRun) {
            await run(bin('jest'), ['--clearCache'])
            await run('npm', ['test', '--', '--bail'])
        } else {
            info(`(skipped)`)
        }

        step('Running lint...')
        if (!skipTests && !isDryRun) {
            await run('npm', ['run', 'lint'])
        } else {
            info(`(skipped)`)
        }

        // build all packages with types
        step('Building package...')
        if (!skipBuild && !isDryRun) {
            await run('npm', ['run', 'build', '--', '--release'])
        } else {
            info(`(skipped)`)
        }

        const npmAction = release.split(' ')[0]
        const pre = release.split(' ')[1]
        const preAction = [
                'prerelease',
                'preminor',
                'premajor',
            ].includes(npmAction) ? ['--preid', pre] : []

        step('Creating a new version ' + targetVersion + ' ...')
        execa.sync('npm', ['version', npmAction, ...preAction, '-m', commitMessage])

    } else {
        error('Branch "main" expected')
    }

    step('Pushing changes ...')
    execa.sync('git', ['push'])

    step('Pushing tags ...')
    execa.sync('git', ['push', '--tags'])

    step('Publishing ...')
    execa.sync('npm', ['publish', '--access', 'public'])
    
    good('All done!')
}

