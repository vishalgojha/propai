package com.chaoscraft.wablaster.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.chaoscraft.wablaster.db.daos.*
import com.chaoscraft.wablaster.db.entities.*

@Database(
    entities = [
        Campaign::class, Contact::class, SendLog::class,
        BroadcastList::class, BroadcastListContact::class,
        Broker::class, BrokerGroup::class, BrokerGroupCrossRef::class,
        Listing::class, CampaignResponse::class, Deal::class
    ],
    version = 3,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun campaignDao(): CampaignDao
    abstract fun contactDao(): ContactDao
    abstract fun sendLogDao(): SendLogDao
    abstract fun broadcastListDao(): BroadcastListDao
    abstract fun broadcastListContactDao(): BroadcastListContactDao
    abstract fun brokerDao(): BrokerDao
    abstract fun brokerGroupDao(): BrokerGroupDao
    abstract fun brokerGroupCrossRefDao(): BrokerGroupCrossRefDao
    abstract fun listingDao(): ListingDao
    abstract fun campaignResponseDao(): CampaignResponseDao
    abstract fun dealDao(): DealDao

    companion object {
        const val DATABASE_NAME = "wablaster.db"

        val MIGRATION_1_2 = Migration(1, 2) { db ->
            db.execSQL("CREATE TABLE IF NOT EXISTS `broadcast_lists` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `contactCount` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `broadcast_list_contacts` (`listId` INTEGER NOT NULL, `phone` TEXT NOT NULL, `name` TEXT NOT NULL, `locality` TEXT, `budget` TEXT, `language` TEXT, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`listId`, `phone`))")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_broadcast_list_contacts_listId` ON `broadcast_list_contacts` (`listId`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_broadcast_list_contacts_phone` ON `broadcast_list_contacts` (`phone`)")
        }

        val MIGRATION_2_3 = Migration(2, 3) { db ->
            db.execSQL("CREATE TABLE IF NOT EXISTS `brokers` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `phone` TEXT NOT NULL, `whatsappNumber` TEXT NOT NULL DEFAULT '', `city` TEXT NOT NULL DEFAULT '', `locality` TEXT NOT NULL DEFAULT '', `pincode` TEXT NOT NULL DEFAULT '', `latitude` REAL NOT NULL DEFAULT 0.0, `longitude` REAL NOT NULL DEFAULT 0.0, `specialization` TEXT NOT NULL DEFAULT '', `languages` TEXT NOT NULL DEFAULT '', `commissionRate` REAL NOT NULL DEFAULT 0.0, `performanceScore` REAL NOT NULL DEFAULT 0.0, `tags` TEXT NOT NULL DEFAULT '', `notes` TEXT NOT NULL DEFAULT '', `isActive` INTEGER NOT NULL DEFAULT 1, `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_brokers_phone` ON `brokers` (`phone`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_brokers_city` ON `brokers` (`city`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_brokers_specialization` ON `brokers` (`specialization`)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `broker_groups` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `type` TEXT NOT NULL DEFAULT 'CUSTOM', `filterCriteria` TEXT NOT NULL DEFAULT '{}', `brokerCount` INTEGER NOT NULL DEFAULT 0, `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `broker_group_cross_ref` (`brokerId` INTEGER NOT NULL, `groupId` INTEGER NOT NULL, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`brokerId`, `groupId`))")
            db.execSQL("CREATE TABLE IF NOT EXISTS `listings` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `projectName` TEXT NOT NULL DEFAULT '', `address` TEXT NOT NULL DEFAULT '', `city` TEXT NOT NULL DEFAULT '', `locality` TEXT NOT NULL DEFAULT '', `pincode` TEXT NOT NULL DEFAULT '', `latitude` REAL NOT NULL DEFAULT 0.0, `longitude` REAL NOT NULL DEFAULT 0.0, `propertyType` TEXT NOT NULL DEFAULT 'FLAT', `subType` TEXT NOT NULL DEFAULT 'RESALE', `price` REAL NOT NULL DEFAULT 0.0, `bhk` INTEGER NOT NULL DEFAULT 0, `areaSqft` INTEGER NOT NULL DEFAULT 0, `possessionDate` TEXT NOT NULL DEFAULT '', `reraNumber` TEXT NOT NULL DEFAULT '', `reraState` TEXT NOT NULL DEFAULT '', `status` TEXT NOT NULL DEFAULT 'COMING_SOON', `amenities` TEXT NOT NULL DEFAULT '', `description` TEXT NOT NULL DEFAULT '', `brochureUrl` TEXT NOT NULL DEFAULT '', `floorPlanUrl` TEXT NOT NULL DEFAULT '', `images` TEXT NOT NULL DEFAULT '', `commissionRate` REAL NOT NULL DEFAULT 0.0, `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `campaign_responses` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `campaignId` INTEGER NOT NULL DEFAULT 0, `listingId` INTEGER NOT NULL DEFAULT 0, `brokerId` INTEGER NOT NULL DEFAULT 0, `brokerName` TEXT NOT NULL DEFAULT '', `brokerPhone` TEXT NOT NULL DEFAULT '', `responseText` TEXT NOT NULL DEFAULT '', `responseType` TEXT NOT NULL DEFAULT 'UNKNOWN', `hotLeadScore` REAL NOT NULL DEFAULT 0.0, `intentLevel` TEXT NOT NULL DEFAULT 'COLD', `responseTimeSec` INTEGER NOT NULL DEFAULT 0, `repliedAt` INTEGER NOT NULL DEFAULT 0, `followUpSent` INTEGER NOT NULL DEFAULT 0, `followUpAt` INTEGER NOT NULL DEFAULT 0, `dealClosed` INTEGER NOT NULL DEFAULT 0, `dealValue` REAL NOT NULL DEFAULT 0.0, `commissionAmount` REAL NOT NULL DEFAULT 0.0, `commissionStatus` TEXT NOT NULL DEFAULT 'PENDING', `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `deals` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `campaignId` INTEGER NOT NULL DEFAULT 0, `listingId` INTEGER NOT NULL DEFAULT 0, `brokerId` INTEGER NOT NULL DEFAULT 0, `clientName` TEXT NOT NULL DEFAULT '', `clientPhone` TEXT NOT NULL DEFAULT '', `dealValue` REAL NOT NULL DEFAULT 0.0, `commissionRate` REAL NOT NULL DEFAULT 0.0, `commissionAmount` REAL NOT NULL DEFAULT 0.0, `commissionSplit` TEXT NOT NULL DEFAULT '[]', `commissionStatus` TEXT NOT NULL DEFAULT 'PENDING', `attributionSource` TEXT NOT NULL DEFAULT 'CAMPAIGN', `stage` TEXT NOT NULL DEFAULT 'INQUIRY', `notes` TEXT NOT NULL DEFAULT '', `closedDate` INTEGER NOT NULL DEFAULT 0, `createdAt` INTEGER NOT NULL)")
            db.execSQL("INSERT OR IGNORE INTO campaign_responses (campaignId, brokerPhone, responseText, responseType, hotLeadScore, intentLevel, repliedAt) SELECT campaignId, contactPhone, 'Auto-imported', 'UNKNOWN', 0.0, 'COLD', timestamp FROM send_logs WHERE status = 'SENT'")
        }

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}