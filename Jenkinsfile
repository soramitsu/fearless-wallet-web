@Library('jenkins-library')

def pipeline = new org.js.AppPipeline(
    steps:              this,
    test:               true,
    packageManager:     'yarn',
    dockerImageName:    'fearless/wallet-web',
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    dockerRegistryCred: 'bot-fearless-rw'
    buildCmds:           ["${-> packageManager} build:extension"]
)
pipeline.runPipeline()