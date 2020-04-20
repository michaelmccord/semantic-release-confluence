const semanticRelease = require('semantic-release');
const path = require('path');
const assert = require('assert');
const {gitbox, gitUtils, npmregistry, mockServer} = require('semantic-release-test-utils');
const tempy = require('tempy');
const fs = require('fs');

const owner = 'git';

const semanticReleaseEnv = {
  GH_TOKEN: gitbox.gitCredential,
  GITHUB_URL: mockServer.url,
  CI: true,
  CONFLUENCE_USERNAME: 'username',
  CONFLUENCE_TOKEN: 'token'
};

const documentContent = fs.readFileSync(path.resolve(__dirname, 'index.xml'));

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
          baseUrl: mockServer.url + '/wiki',
          documentID: '1234',
          documentPath: path.resolve(__dirname,'index.xml')
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
      {headers: [{name: 'Authorization', values: [`Basic username:token`]}]},
      {
        body: {
          version: { number: 1 },
          id: '1234',
          space: {
            key: 'TST'
          },
          title: 'Testing'
        },
        method: 'GET'
      }
    );

    let putDocumentMock = await mockServer.mock('/wiki/rest/api/content/1234',
    {
      headers: [
      {name: 'Authorization', values: [`Basic username:token`]},
      {name: 'Accept', values: 'application/json'},
      {name: 'Content-Type', values: 'application/json'}
      ]
    },
    {
      body: {
        "id": '1234',
        "type": "page",
        "title": 'Testing',
        "space": {
            "key": 'TST'
        },
        "version": {
            "number": 2,
            "minorEdit": false
        },
        "body": {
            "storage": {
                "value": documentContent,
                "representation": "storage"
            }
        }
      },
      method: 'PUT'
    }
    );


    gitUtils.gitCommits(['feat: force a release'], {cwd});

    var release = await semanticRelease(config, {cwd, env: semanticReleaseEnv});



  }, 100000);

});


