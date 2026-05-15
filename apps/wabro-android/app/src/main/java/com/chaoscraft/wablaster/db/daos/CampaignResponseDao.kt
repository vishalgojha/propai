package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import kotlinx.coroutines.flow.Flow

@Dao
interface CampaignResponseDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(response: CampaignResponse): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(responses: List<CampaignResponse>)

    @Update
    suspend fun update(response: CampaignResponse)

    @Query("SELECT * FROM campaign_responses WHERE campaignId = :campaignId ORDER BY repliedAt DESC")
    fun getByCampaign(campaignId: Long): Flow<List<CampaignResponse>>

    @Query("SELECT * FROM campaign_responses WHERE campaignId = :campaignId AND intentLevel = :intentLevel ORDER BY repliedAt DESC")
    fun getByCampaignAndIntent(campaignId: Long, intentLevel: String): Flow<List<CampaignResponse>>

    @Query("SELECT * FROM campaign_responses WHERE campaignId = :campaignId AND intentLevel = 'HOT' ORDER BY repliedAt DESC")
    fun getHotLeads(campaignId: Long): Flow<List<CampaignResponse>>

    @Query("""
        SELECT cr.*, b.name as brokerName, b.city, b.specialization 
        FROM campaign_responses cr 
        LEFT JOIN brokers b ON cr.brokerId = b.id 
        WHERE cr.campaignId = :campaignId 
        ORDER BY cr.hotLeadScore DESC
    """)
    fun getResponsesWithBrokerInfo(campaignId: Long): Flow<List<CampaignResponse>>

    @Query("SELECT COUNT(*) FROM campaign_responses WHERE campaignId = :campaignId")
    fun getCountByCampaign(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM campaign_responses WHERE campaignId = :campaignId AND intentLevel = 'HOT'")
    fun getHotLeadCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM campaign_responses WHERE campaignId = :campaignId AND intentLevel = 'WARM'")
    fun getWarmLeadCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM campaign_responses WHERE campaignId = :campaignId AND intentLevel = 'COLD'")
    fun getColdLeadCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM campaign_responses WHERE campaignId = :campaignId AND followUpSent = 0")
    fun getUnfollowedCount(campaignId: Long): Flow<Int>

    @Query("SELECT * FROM campaign_responses WHERE campaignId = :campaignId AND dealClosed = 0 AND intentLevel = 'HOT' ORDER BY repliedAt ASC")
    fun getUnclosedHotLeads(campaignId: Long): Flow<List<CampaignResponse>>

    @Query("SELECT AVG(hotLeadScore) FROM campaign_responses WHERE campaignId = :campaignId")
    fun getAvgScore(campaignId: Long): Flow<Double?>

    @Query("UPDATE campaign_responses SET followUpSent = 1, followUpAt = :timestamp WHERE id = :id")
    suspend fun markFollowUpSent(id: Long, timestamp: Long)

    @Query("UPDATE campaign_responses SET dealClosed = 1, dealValue = :value WHERE id = :id")
    suspend fun markDealClosed(id: Long, value: Double)

    @Query("UPDATE campaign_responses SET commissionStatus = :status WHERE id = :id")
    suspend fun updateCommissionStatus(id: Long, status: String)

    @Query("DELETE FROM campaign_responses WHERE campaignId = :campaignId")
    suspend fun deleteByCampaign(campaignId: Long)
}