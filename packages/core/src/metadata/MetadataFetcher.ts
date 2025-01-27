import SFPLogger, { Logger, LoggerLevel } from '@dxatscale/sfp-logger';
import SFPOrg from '../org/SFPOrg';
import { delay } from '../utils/Delay';
const fs = require('fs-extra');
import AdmZip = require('adm-zip');
import { XMLParser } from 'fast-xml-parser';
import { Connection } from '@salesforce/core';
import { RetrieveResult } from 'jsforce/lib/api/metadata';

export default class MetadataFetcher {
    constructor(private logger: Logger) {}

    public async getSetttingMetadata(org: SFPOrg, setting: string) {
        SFPLogger.log(`Fetching ${setting}Settings from Org`, LoggerLevel.INFO, this.logger);
        let retriveLocation = await new MetadataFetcher(this.logger).fetchPackageFromOrg(org, {
            types: { name: 'Settings', members: setting },
        });
        let resultFile = `${retriveLocation}/settings/${setting}.settings`;
        const parser = new XMLParser();
        let parsedSettings = parser.parse(fs.readFileSync(resultFile).toString())[`${setting}Settings`];
        return parsedSettings;
    }

    public async fetchPackageFromOrg(org: SFPOrg, members: any) {
        let connection = org.getConnection();
        const apiversion = await org.getConnection().retrieveMaxApiVersion();

        let retrieveRequest = {
            apiVersion: Number(apiversion),
        };

        retrieveRequest['singlePackage'] = true;
        retrieveRequest['unpackaged'] = members;
        connection.metadata.pollTimeout = 60;
        let retrievedId = await connection.metadata.retrieve(retrieveRequest);
        SFPLogger.log(`Fetching  metadata from ${connection.getUsername()}`, LoggerLevel.DEBUG, this.logger);

        let metadata_retrieve_result = await this.checkRetrievalStatus(connection, retrievedId.id);
        if (!metadata_retrieve_result.zipFile)
            SFPLogger.log('Unable to find the requested metadata', LoggerLevel.ERROR, this.logger);

        let retriveLocation = `.sfpowerscripts/retrieved/${retrievedId}`;
        //Extract Security
        let zipFileName = `${retriveLocation}/unpackaged.zip`;
        fs.mkdirpSync(retriveLocation);
        fs.writeFileSync(zipFileName, metadata_retrieve_result.zipFile, {
            encoding: 'base64',
        });
        this.extract(retriveLocation, zipFileName);
        fs.unlinkSync(zipFileName);
        return retriveLocation;
    }

    private async checkRetrievalStatus(
        conn: Connection,
        retrievedId: string,
        isToBeLoggedToConsole: boolean = true
    ): Promise<RetrieveResult> {
        let metadata_result:RetrieveResult;

        while (true) {
            metadata_result = await conn.metadata.checkRetrieveStatus(retrievedId);

            if (metadata_result.done === false) {
                if (isToBeLoggedToConsole) SFPLogger.log(`Polling for Retrieval Status`, LoggerLevel.INFO, this.logger);
                await delay(5000);
            } else {
                //this.ux.logJson(metadata_result);
                break;
            }
        }
        return metadata_result;
    }

    private extract(unzippedDirectory: string, zipFile: string) {
        let zip = new AdmZip(zipFile);
        // Overwrite existing files
        zip.extractAllTo(unzippedDirectory, true);
    }
}
