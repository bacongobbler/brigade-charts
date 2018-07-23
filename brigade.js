const { events, Job, Group} = require('brigadier')

const charts = [
    'brigade',
    'kashti'
]

function test(e, project) {
    var linter = new Job('chart-lint', 'gcr.io/kubernetes-helm/helm:canary');
    linter.tasks = [`cd /src`];
    for (let chart of charts) {
        linter.tasks.push(`helm lint ${chart}`);
    }
    return linter.run();
}

function release(e, project) {
    var packager = new Job('chart-packager', 'gcr.io/kubernetes-helm/helm:canary')
    packager.storage.enabled = true;
    packager.tasks = [`cd /src`];
    for (let chart of charts) {
        packager.tasks.push(`helm package ${chart}`);
    }
    var downloader = new Job('chart-downloader', 'microsoft/azure-cli:latest')
    downloader.storage.enabled = true;
    downloader.env = {
        AZURE_CLIENT_ID: project.secrets.azureClientID,
        AZURE_CLIENT_SECRET: project.secrets.azureClientSecret,
        AZURE_CLIENT_TENANT: project.secrets.azureClientTenant,
        AZURE_SUBSCRIPTION_ID: project.secrets.azureSubscriptionID,
        AZURE_STORAGE_CONTAINER: project.secrets.azureStorageContainer,
    }
    downloader.tasks = [
        `cd /src`,
        `az storage container lease acquire --container-name $AZURE_STORAGE_CONTAINER --lease-duration 60`,
        // download the chart repository to merge in with the newly packaged charts
        `az storage blob download-batch --container-name $AZURE_STORAGE_CONTAINER --destination _repo/`,
        `cp *.tgz _repo/`
    ];

    var indexer = new Job('chart-indexer', 'gcr.io/kubernetes-helm/helm:canary')
    indexer.tasks = [
        `cd /src/_repo/`,
        `helm repo index .`
    ];

    var releaser = new Job('chart-releaser', 'microsoft/azure-cli:latest')
    releaser.tasks = [
        `cd /src`,
        `az storage blob upload-batch --source _repo/ --destination "$AZURE_STORAGE_CONTAINER"`,
        `az storage container lease release --container-name $AZURE_STORAGE_CONTAINER`,
    ];

    return Group.runEach([packager, downloader, indexer, releaser]);
}

events.on('exec', test);
events.on('pull_request', test);
events.on('push', release);
