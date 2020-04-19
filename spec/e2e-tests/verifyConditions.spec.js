var semanticRelease = require('semantic-release');
var path = require('path');
var assert = require('assert');
var {gitbox, gitUtils, npmregistry, mockServer} = require('semantic-release-test-utils');
var tempy = require('tempy');

const owner = 'git';

const semanticReleaseEnv = {
  GH_TOKEN: gitbox.gitCredential,
  GITHUB_URL: mockServer.url,
  CI: true
}

beforeAll(async function() {
  console.info('Starting test servers....');
  await Promise.allSettled(
    [gitbox.start(),
    npmregistry.start(),
    mockServer.start()]
  );
}, 100000);

afterAll(async function(){
  console.info('Stopping test servers....');
  await Promise.allSettled([
    gitbox.stop(),
    npmregistry.stop(),
    mockServer.stop()
  ])
}, 100000);

beforeEach(function() {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;
  jasmine.default_timeout_interval = 100000;
  jasmine.DEFAULT_TIMEOUT_WINDOW = 100000;
}, 100000)

describe('verifyConditions',function(){



  it('checks for presence of spec-md', async function() {

    jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;
    jasmine.default_timeout_interval = 100000;

    const packageName = 'test-package';
    const gitConfig = await gitbox.createRepo(packageName);
    const config = {
      ...gitConfig,
      plugins: [
        [path.resolve(__dirname,'../../'), {
          specPath: path.resolve(__dirname, '../../README.md'),
          outputPath: path.resolve(gitConfig.cwd, 'outputfile'),
          plugin: {
            package: path.resolve(__dirname, '../test-plugin')
          }
        }]
      ],
      dryRun: false,
      ci: true
    };
    const cwd = config.cwd;


    let verifyMock = await mockServer.mock(
      `/repos/${owner}/${packageName}`,
      {headers: [{name: 'Authorization', values: [`token ${semanticReleaseEnv.GH_TOKEN}`]}]},
      {body: {permissions: {push: true}}, method: 'GET'}
    );

    let getDocumentMock = await mockServer.mock(`/wiki/rest/api/content/1234`,
      {headers: [{name: 'Authorization', values: [`Basic username:token`]}]}),

      ;


    gitUtils.gitCommits(['feat: force a release'], {cwd});

    var release = await semanticRelease(config, {cwd, env: semanticReleaseEnv});



  }, 100000);

});


