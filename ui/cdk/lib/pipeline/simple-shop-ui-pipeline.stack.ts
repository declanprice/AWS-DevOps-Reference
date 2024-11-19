import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import {SimpleShopUiComputeStage} from "../compute/simple-shop-ui-compute.stage";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";

export class SimpleShopUiPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const githubConnectionArn = this.node.tryGetContext('githubConnectionArn') as string;

        const shell = new ShellStep('ShellStep', {
            input: CodePipelineSource.connection('declanprice/simple-shop', 'main', {connectionArn: githubConnectionArn}),
            installCommands: ['cd ui', 'npm install', 'npm run build', 'cd cdk', 'npm install'],
            commands: ['npm run cdk synth -- --output ../cdk.out'],
            primaryOutputDirectory: 'ui',
        });

        const pipeline = new CodePipeline(this, 'CodePipeline', {
            synth: shell,

            selfMutation: false,
            role: new Role(this, 'SimpleShopUiPipelineRole', {
                roleName: 'SimpleShopUiPipelineRole',
                assumedBy: new AnyPrincipal(),
                inlinePolicies: {
                    'sts': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['sts:AssumeRole']
                            })
                        ]
                    })
                }
            }),
        });

        pipeline.addStage(new SimpleShopUiComputeStage(this, 'SimpleShopUiComputeStage', props));
    }
}
