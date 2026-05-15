package com.chaoscraft.wablaster.di

import android.content.Context
import android.content.SharedPreferences
import com.chaoscraft.wablaster.db.AppDatabase
import com.chaoscraft.wablaster.db.daos.*
import com.chaoscraft.wablaster.db.BrokerRepository
import com.chaoscraft.wablaster.db.ListingRepository
import com.chaoscraft.wablaster.engine.HumanTimingEngine
import com.chaoscraft.wablaster.engine.ResponseClassifier
import com.chaoscraft.wablaster.engine.ResponseTracker
import com.chaoscraft.wablaster.engine.Skill
import com.chaoscraft.wablaster.engine.SkillPipeline
import com.chaoscraft.wablaster.engine.skills.*
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.GeminiClient
import com.google.gson.Gson
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableSharedFlow
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return AppDatabase.getInstance(context)
    }

    // ===== DAO Providers =====

    @Provides
    @Singleton
    fun provideCampaignDao(database: AppDatabase): CampaignDao {
        return database.campaignDao()
    }

    @Provides
    @Singleton
    fun provideContactDao(database: AppDatabase): ContactDao {
        return database.contactDao()
    }

    @Provides
    @Singleton
    fun provideSendLogDao(database: AppDatabase): SendLogDao {
        return database.sendLogDao()
    }

    @Provides
    @Singleton
    fun provideBroadcastListDao(database: AppDatabase): BroadcastListDao {
        return database.broadcastListDao()
    }

    @Provides
    @Singleton
    fun provideBroadcastListContactDao(database: AppDatabase): BroadcastListContactDao {
        return database.broadcastListContactDao()
    }

    // ===== V2 DAO Providers =====

    @Provides
    @Singleton
    fun provideBrokerDao(database: AppDatabase): BrokerDao {
        return database.brokerDao()
    }

    @Provides
    @Singleton
    fun provideBrokerGroupDao(database: AppDatabase): BrokerGroupDao {
        return database.brokerGroupDao()
    }

    @Provides
    @Singleton
    fun provideBrokerGroupCrossRefDao(database: AppDatabase): BrokerGroupCrossRefDao {
        return database.brokerGroupCrossRefDao()
    }

    @Provides
    @Singleton
    fun provideListingDao(database: AppDatabase): ListingDao {
        return database.listingDao()
    }

    @Provides
    @Singleton
    fun provideCampaignResponseDao(database: AppDatabase): CampaignResponseDao {
        return database.campaignResponseDao()
    }

    @Provides
    @Singleton
    fun provideDealDao(database: AppDatabase): DealDao {
        return database.dealDao()
    }

    // ===== Repositories =====

    @Provides
    @Singleton
    fun provideBrokerRepository(
        brokerDao: BrokerDao,
        groupDao: BrokerGroupDao,
        crossRefDao: BrokerGroupCrossRefDao,
        @ApplicationContext context: Context
    ): BrokerRepository {
        return BrokerRepository(brokerDao, groupDao, crossRefDao, context)
    }

    @Provides
    @Singleton
    fun provideListingRepository(
        listingDao: ListingDao,
        responseDao: CampaignResponseDao,
        dealDao: DealDao,
        sendLogDao: SendLogDao
    ): ListingRepository {
        return ListingRepository(listingDao, responseDao, dealDao, sendLogDao)
    }

    // ===== Engine =====

    @Provides
    @Singleton
    fun provideResponseTracker(
        responseDao: CampaignResponseDao,
        dealDao: DealDao,
        brokerDao: BrokerDao,
        listingDao: ListingDao
    ): ResponseTracker {
        return ResponseTracker(responseDao, dealDao, brokerDao, listingDao)
    }

    @Provides
    @Singleton
    fun provideHumanTimingEngine(): HumanTimingEngine {
        return HumanTimingEngine()
    }

    @Provides
    @Singleton
    fun provideSkills(prefs: SharedPreferences, gemini: GeminiClient): List<Skill> {
        val backendReplyEvents = MutableSharedFlow<String>(replay = 0)
        return listOf(
            SpinSkill(),
            MergeSkill(),
            TranslateSkill(gemini),
            SmartCaptionSkill(gemini),
            AIRewriteSkill(gemini),
            ReplyGuardSkill(backendReplyEvents),
            WarmupSkill(prefs)
        )
    }

    @Provides
    @Singleton
    fun provideSkillPipeline(skills: @JvmSuppressWildcards List<Skill>): SkillPipeline {
        return SkillPipeline(skills)
    }

    // ===== Shared =====

    @Provides
    @Singleton
    fun provideSharedPreferences(@ApplicationContext context: Context): SharedPreferences {
        return context.getSharedPreferences("wablaster_prefs", Context.MODE_PRIVATE)
    }

    @Provides
    @Singleton
    fun provideGson(): Gson {
        return Gson()
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}
