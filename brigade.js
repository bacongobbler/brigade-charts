const { events, Job, Group} = require('brigadier')
const uuidv4 = require('uuid/v4');

const charts = [
    'brigade',
    'kashti'
]

function test(e, project) {
    var linter = new Job('chart-lint', 'gcr.io/kubernetes-helm/tiller:canary');
    linter.tasks = [`cd /src`];
    for (let chart of charts) {
        linter.tasks.push(`helm lint ${chart}`);
    }
    return linter.run();
}

function release(e, project) {
    var leaseID = uuidv4();
    var packager = new Job('chart-packager', 'gcr.io/kubernetes-helm/tiller:canary')
    packager.storage.enabled = true;
    packager.tasks = [
        `cd /src`,
        `helm init --client-only`,
    ];
    for (let chart of charts) {
        packager.tasks.push(`helm package ${chart} --destination /mnt/brigade/share`);
    }
    var downloader = new Job('chart-downloader', 'microsoft/azure-cli:latest')
    downloader.storage.enabled = true;
    downloader.env = {
        AZURE_STORAGE_ACCOUNT: project.secrets.azureStorageAccount,
        AZURE_STORAGE_KEY: project.secrets.azureStorageKey,
        AZURE_STORAGE_CONTAINER: project.secrets.azureStorageContainer,
    }
    downloader.tasks = [
        `cd /mnt/brigade/share`,
        `az storage container lease acquire --container-name $AZURE_STORAGE_CONTAINER --lease-duration 60 --proposed-lease-id ${leaseID}`,
        // download the chart repository to merge in with the newly packaged charts
        `mkdir _repo/`,
        `az storage blob download-batch --source $AZURE_STORAGE_CONTAINER --destination _repo/`,
        `cp *.tgz _repo/`
    ];

    var indexer = new Job('chart-indexer', 'gcr.io/kubernetes-helm/tiller:canary')
    indexer.storage.enabled = true;
    indexer.tasks = [
        `cd /mnt/brigade/share/_repo/`,
        `helm repo index .`
    ];

    var releaser = new Job('chart-releaser', 'microsoft/azure-cli:latest')
    releaser.storage.enabled = true;
    releaser.env = {
        AZURE_STORAGE_ACCOUNT: project.secrets.azureStorageAccount,
        AZURE_STORAGE_KEY: project.secrets.azureStorageKey,
        AZURE_STORAGE_CONTAINER: project.secrets.azureStorageContainer,
    }
    releaser.tasks = [
        `cd /mnt/brigade/share`,
        `az storage blob upload-batch --source _repo/ --destination "$AZURE_STORAGE_CONTAINER"`,
        `az storage container lease release --container-name $AZURE_STORAGE_CONTAINER --lease-id ${leaseID}`,
    ];

    return Group.runEach([packager, downloader, indexer, releaser]);
}

events.on('exec', release);
events.on('pull_request', test);
events.on('push', release);
