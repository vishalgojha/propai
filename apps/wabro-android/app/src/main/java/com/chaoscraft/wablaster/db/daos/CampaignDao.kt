package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Campaign
import kotlinx.coroutines.flow.Flow

@Dao
interface CampaignDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(campaign: Campaign): Long

    @Update
    suspend fun update(campaign: Campaign)

    @Delete
    suspend fun delete(campaign: Campaign)

    @Query("SELECT * FROM campaigns WHERE id = :id")
    suspend fun getById(id: Long): Campaign?

    @Query("SELECT * FROM campaigns WHERE id = :id")
    fun getByIdFlow(id: Long): Flow<Campaign?>

    @Query("SELECT * FROM campaigns ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<Campaign>>

    @Query("SELECT * FROM campaigns WHERE status = :status ORDER BY createdAt DESC")
    fun getByStatus(status: String): Flow<List<Campaign>>

    @Query("SELECT * FROM campaigns WHERE status = :status ORDER BY createdAt DESC")
    suspend fun getByStatusSync(status: String): List<Campaign>

    @Query("UPDATE campaigns SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String)
}
