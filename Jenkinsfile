@Library('jenkins-library@feature/fww-158/ci-for-PRs')

def pipeline = new org.js.AppPipeline(
    steps:              this,
    dockerImageName:    'fearless/wallet-web',
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    dockerRegistryCred: 'bot-fearless-rw',
    buildCmds:           ['yarn build:extension && yarn electron:build'],
    buildWithCred:      true
)
pipeline.runPipeline()