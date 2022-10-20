@Library('jenkins-library')

def pipeline = new org.js.AppPipeline(
    steps:              this,
    dockerImageName:    'fearless/wallet-web',
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    dockerRegistryCred: 'bot-fearless-rw',
    buildCmds:           ['yarn build:extension && yarn electron:build'],
    buildEnvironment: [
          GH_USER: 'sorabot',
          GH_TOKEN: credentials('sorabot-github-token')
        ]
)
pipeline.runPipeline()