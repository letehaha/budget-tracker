# budget-tracker-fe

## Warning

There is also a backend that provides all information and API, but currently, it's under development in the private repo, so the frontend is useless at the moment.

## Project setup

0. Make sure you have a correct Node version, specified in the `.nvmrc` file. You can use `nvm use` if you have one
1. Install packages with `npm install`
2. Create a `.env` file from `.env.template`
3. Run the app with `npm run dev`
4. Build it with `npm run build`

## Additional information

1. Backend repository shares some TypeScript types using **git submodules** functionality, that can be accessible by importing them from `shared-types`. For convenience, there's a `git-pull` npm script that pulls all the submodules. To init git submodules run `git submodule update --init --recursive` command.
