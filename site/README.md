# Fearless website

The website is owned by the browser repository under `site/`. Install, typecheck, and build from this directory using its independent lockfile. Hosting must use `soramitsu/fearless-wallet-web` with root directory `site`; `site/vercel.json` preserves the build contract. The former website checkout is retained as recovery material until the deployment has moved.

Network catalog generation reads this repository's `remote-config/production/chains/v13/chains.json`. Native app associations remain in `src/public/.well-known` and are tested before building.

# Fearless wallet website

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
yarn install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
yarn dev
```

## Production

Build the application for production:

```bash
yarn build
```

Locally preview production build:

```bash
yarn preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

Production deployment for Fearless Site must source only from the protected
`master` branch. See [docs/deployment.md](./docs/deployment.md) for the release
branch contract and provider-side checks.

## Release notes

To fetch new release notes from GitHub run the following script

```bash
yarn notes
```

and then commit the changes to the repo

```bash
git add .
git commit -m 'feat: upgrade release-notes'
```

source code of the fetching script can be found [here](./fetchReleaseNotes.js)
