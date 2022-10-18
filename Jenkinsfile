@Library('jenkins-library')

def pipeline = new org.js.AppPipeline(
    steps:              this,
    test:               false,
    dockerImageName:    'fearless/wallet-web',
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    dockerRegistryCred: 'bot-fearless-rw'
)
pipeline.runPipeline()