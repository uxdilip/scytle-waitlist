import { Client, Databases, Permission, Role } from 'node-appwrite';

async function setup() {
    const client = new Client()
        .setEndpoint('https://cloud.appwrite.io/v1')
        .setProject('697f1aae0010e3a71ed7')
        .setKey('standard_00318144073e3742457bb7a2d41684957d9df8588f14a03b2fcf18a1ea7ff5307a7c3a092775e1b8bf09d1602e649429e0153e2406d6dc5e0f61f6d514b86c11afda74ff9ba11ef1f1246de9b178586b0d7bdbf4f278b6bbf460d433dd7c9a4f244eff585b0f11668f341f7cbe96f68537d25a61b9c0bbca1772d0bb783a668e');

    const databases = new Databases(client);
    const dbId = 'scytle_db';
    const collectionId = 'support_tickets';

    try {
        console.log('Checking if collection exists...');
        try {
            await databases.getCollection(dbId, collectionId);
            console.log('Collection already exists.');
        } catch (e) {
            console.log('Creating Support Tickets collection...');
            await databases.createCollection(
                dbId, 
                collectionId, 
                'Support Tickets', 
                [ Permission.create(Role.any()) ]
            );
            console.log('Collection created successfully.');
        }

        console.log('Creating attributes...');
        const attributes = [
            databases.createStringAttribute(dbId, collectionId, 'email', 255, true),
            databases.createStringAttribute(dbId, collectionId, 'subject', 255, true),
            databases.createStringAttribute(dbId, collectionId, 'message', 5000, true),
            databases.createStringAttribute(dbId, collectionId, 'status', 50, false, 'open')
        ];
        
        await Promise.allSettled(attributes);
        console.log('Attributes generated! Please wait 10 seconds for Appwrite to finish processing them.');

    } catch (error) {
        console.error('Failed to setup Appwrite:', error.message);
    }
}

setup();
