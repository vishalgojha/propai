package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.BroadcastList
import kotlinx.coroutines.flow.Flow

@Dao
interface BroadcastListDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(list: BroadcastList): Long

    @Update
    suspend fun update(list: BroadcastList)

    @Delete
    suspend fun delete(list: BroadcastList)

    @Query("SELECT * FROM broadcast_lists ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<BroadcastList>>

    @Query("SELECT * FROM broadcast_lists WHERE id = :id")
    suspend fun getById(id: Long): BroadcastList?

    @Query("SELECT * FROM broadcast_lists ORDER BY createdAt DESC")
    suspend fun getAll(): List<BroadcastList>

    @Query("UPDATE broadcast_lists SET contactCount = (SELECT COUNT(*) FROM broadcast_list_contacts WHERE listId = :listId) WHERE id = :listId")
    suspend fun updateContactCount(listId: Long)
}
