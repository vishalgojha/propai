package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.SendLog
import kotlinx.coroutines.flow.Flow

@Dao
interface SendLogDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: SendLog)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(logs: List<SendLog>)

    @Query("SELECT * FROM send_logs WHERE campaignId = :campaignId ORDER BY timestamp DESC")
    fun getByCampaign(campaignId: Long): Flow<List<SendLog>>

    @Query("SELECT * FROM send_logs WHERE campaignId = :campaignId ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentByCampaign(campaignId: Long, limit: Int = 20): List<SendLog>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId")
    fun getTotalCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId AND status = :status")
    fun getCountByStatus(campaignId: Long, status: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId AND status = 'SENT'")
    fun getSentCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId AND status = 'FAILED'")
    fun getFailedCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId AND status = 'SKIPPED'")
    fun getSkippedCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM send_logs WHERE campaignId = :campaignId AND status = 'REPLY_PAUSED'")
    fun getPausedCount(campaignId: Long): Flow<Int>

    @Query("DELETE FROM send_logs WHERE campaignId = :campaignId")
    suspend fun deleteByCampaign(campaignId: Long)
}
