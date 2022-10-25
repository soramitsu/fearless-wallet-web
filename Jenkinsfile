@Library('jenkins-library@feature/fww-158/ci-for-PRs')

def pipeline = new org.js.App2Pipeline(
    steps:              this,
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    buildCmds:           ['yarn build:extension && yarn electron:build'],
    buildWithCred:      true,
    pushToNexus:        true,
    nexusCredentials:   'bot-soramitsu-rw',
    dockerRegistry:     "nexus.iroha.tech:19000",
    dockerImageName:    "fearless/web-wallet",
    dockerImageTags:    ['master': 'latest', 'develop': 'dev', 'feature/FWW-158/ci-for-PRs':'test']
)
pipeline.runPipeline()