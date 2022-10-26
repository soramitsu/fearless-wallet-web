@Library('jenkins-library@feature/fww-158/ci-for-PRs')

def pipeline = new org.js.App2Pipeline(
    steps:              this,
    buildDockerImage:   'docker.soramitsu.co.jp/build-tools/node:14-ubuntu',
    buildCmds:           ['yarn build:extension && yarn electron:build'],
    buildWithCred:      true,
    pushArtifactsToNexus:        true,
    nexusCredentials:   'bot-soramitsu-rw',
    nexusUserId:        'bot-fearless-rw',
    dockerRegistry:     "nexus.iroha.tech:19004",
    dockerImageName:    "fearless/wallet-web",
    dockerImageTags:    ['master': 'latest', 'develop': 'dev', 'feature/FWW-158/ci-for-PRs':'test']    
)
pipeline.runPipeline()