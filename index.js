'use strict'

const async = require('asyncawait/async');
const await = require('asyncawait/await');
const Promise = require('bluebird');
const AWS = require('aws-sdk');
const config = require('config');
const _ = require("lodash");

AWS.config.region = config.get('AWS.Region');
const alarmSuffix = config.get('Alarm.AlarmSuffix');
const thresholds = config.get('Alarm.Thresholds');
const okActions = config.get('Alarm.OKActions');
const alarmActions = config.get('Alarm.AlarmActions');
const insufficientDataActions = config.get('Alarm.InsufficientDataActions');

const ec2 = new AWS.EC2();
const cloudwatch = new AWS.CloudWatch();

const getInstances = async ((instanceTypes) => {
    let instances = [];
    let nextToken = undefined;
    do {
        let params = {
            Filters: [
                {
                    Name: 'instance-type',
                    Values: instanceTypes
                },
                {
                    Name: 'instance-state-name',
                    Values: ['running']
                }
            ],
            NextToken: nextToken
        };
        let data = await (ec2.describeInstances(params).promise());
        instances = _.concat(instances, _.flatten(_.map(data.Reservations, (reservation) => {
            return _.map(reservation.Instances, (instance) => {
                let tag = _.find(instance.Tags, { Key: 'Name' });
                let name = _.isUndefined(tag) ? null : tag.Value;
                return { InstanceId: instance.InstanceId, InstanceName: name, InstanceType: instance.InstanceType };
            });
        })));
        nextToken = data.NextToken;
    } while (! _.isUndefined(nextToken));
    return instances;
});

const getAlarms = async (() => {
    let alarms = [];
    let nextToken = undefined;
    do {
        let params = {
            NextToken: nextToken
        };
        let data = await (cloudwatch.describeAlarms(params).promise());
        alarms = _.concat(alarms, _.filter(data.MetricAlarms, (alarm) => alarm.AlarmName.endsWith(alarmSuffix)));
        nextToken = data.NextToken;
    } while (! _.isUndefined(nextToken));
    return alarms;
});

const putAlarm = (alarmName, instanceId, threshold, okActions, alarmActions, insufficientDataActions) => {
    let params = {
        AlarmName: alarmName,
        ActionsEnabled: true,
        OKActions: okActions,
        AlarmActions: alarmActions,
        InsufficientDataActions: insufficientDataActions,
        MetricName: 'CPUCreditBalance',
        Namespace: 'AWS/EC2',
        Statistic: 'Average',
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: threshold,
        ComparisonOperator: 'LessThanThreshold'
    };
    return cloudwatch.putMetricAlarm(params).promise();
};

const deleteAlarms = (alarmNames) => {
    let params = {
        AlarmNames: alarmNames
    };
    return cloudwatch.deleteAlarms(params).promise();
};

const getAlarmName = (instanceName, instanceId, alarmSuffix) => {
    return (_.isNull(instanceName) ? instanceId : (instanceName + '-' + instanceId)) + alarmSuffix;
};

exports.handler = function (event, context, callback) {
    let instanceTypes = _.keys(thresholds);
    let currentInstances;
    let currentAlarms;
    Promise.all([getInstances(instanceTypes), getAlarms()])
    .then((data) => {
        currentInstances = _.each(data[0], (instance) => {
            instance.AlarmName = getAlarmName(instance.InstanceName, instance.InstanceId, alarmSuffix);
        });
        currentAlarms = data[1];
        let newInstances = _.differenceBy(currentInstances, currentAlarms, 'AlarmName');
        if (! _.isEmpty(newInstances)) {
            console.log("Put Alarms:\n" + _.join(_.map(newInstances, (instance) => instance.AlarmName), "\n"));
        }
        return _.map(newInstances, (instance) => {
            let alarmName = instance.AlarmName;
            let instanceId = instance.InstanceId;
            let threshold = thresholds[instance.InstanceType];
            return putAlarm(alarmName, instanceId, threshold, okActions, alarmActions, insufficientDataActions);
        });
    }).then((data) => {
        let oldAlarms = _.differenceBy(currentAlarms, currentInstances, 'AlarmName');
        let oldAlarmNames = _.map(oldAlarms, (alarm) => alarm.AlarmName);
        if (! _.isEmpty(oldAlarmNames)) {
            console.log("Delete Alarms:\n" + _.join(oldAlarmNames, "\n"));
        }
        return deleteAlarms(oldAlarmNames);
    }).then((data) => {
        callback();
    }).catch((err) => {
        callback(err);
    });
};
